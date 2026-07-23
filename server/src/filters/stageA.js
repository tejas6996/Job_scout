// Stage A — deterministic, auditable fresher/experience filter. Fast and
// cheap: pure regex, no network/LLM calls. Anything it can't confidently
// resolve is returned as decision: 'undecided' so Stage B (the LLM
// classifier, filters/stageB.js) can take a second pass at just that job.
//
// Ambiguity policy (per product decision — bias toward excluding, not
// including, when unsure): if years can't be determined and the posting
// carries a seniority signal, exclude. If years can't be determined and the
// posting carries a fresher-role signal (intern/trainee/GET/fresher/...),
// include but mark low_confidence. Otherwise, defer to Stage B.

const TITLE_SENIOR_WORDS =
  /\b(senior|sr\.?|lead|principal|staff|architect|manager|head\s+of|director)\b/i;
const ROMAN_SUFFIX = /\b(II|III|IV)\b/; // e.g. "Software Engineer II" — case-sensitive on purpose
// Internal level-number suffix attached directly to a role word, e.g. "Data
// Analyst 3", "Business Analyst II" (covered above), "Data Engineer L3".
// Anchored to the role word on purpose — an unanchored digit/roman-numeral
// check is too broad and would reject legit postings ("team of 5", "L2
// support ticket").
const ROLE_LEVEL_SUFFIX = /\b(analyst|engineer|developer|scientist|consultant)\s*(?:[-\s]?[2-9]\b|\s*L[2-9]\b)/i;

const YEARS_PLUS = /(\d{1,2})\s*\+\s*(?:years?|yrs?)/gi;
const YEARS_MIN_AT_LEAST = /(?:minimum|min\.?|at\s+least)\s+(?:of\s+)?(\d{1,2})\s*(?:years?|yrs?)/gi;
const YEARS_RANGE = /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi;
const YEARS_OF_EXPERIENCE = /(\d{1,2})\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|relevant\s+|work\s+)?experience/gi;
const MONTHS_FIGURE = /(\d{1,3})\s*months?/i;

function buildSignalRegex(phrase) {
  if (phrase.toLowerCase() === 'get') return /\bGET\b/; // case-sensitive: avoid matching the verb "get"
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function anyMatch(text, phrases) {
  return phrases.some((p) => buildSignalRegex(p).test(text));
}

function roleTypeFromSignals(text) {
  if (/\b(intern(ship)?)\b/i.test(text)) return 'internship';
  if (/\b(apprentice(ship)?)\b/i.test(text)) return 'apprenticeship';
  if (/\b(trainee|graduate\s+engineer\s+trainee|management\s+trainee|campus\s+hire)\b/i.test(text) || /\bGET\b/.test(text)) {
    return 'trainee';
  }
  return 'full_time_entry';
}

function extractRange(text) {
  const plusVals = [...text.matchAll(YEARS_PLUS)].map((m) => Number(m[1]));
  const minAtLeastVals = [...text.matchAll(YEARS_MIN_AT_LEAST)].map((m) => Number(m[1]));
  const rangeVals = [...text.matchAll(YEARS_RANGE)].map((m) => [Number(m[1]), Number(m[2])]);
  const experienceVals = [...text.matchAll(YEARS_OF_EXPERIENCE)].map((m) => Number(m[1]));

  const openEnded = [...plusVals, ...minAtLeastVals].filter((n) => Number.isFinite(n));
  const ranges = rangeVals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const singles = experienceVals.filter((n) => Number.isFinite(n));

  return { openEnded, ranges, singles };
}

// Returns { decision, min_years, max_years, role_type, confidence, reason }.
export function evaluateStageA(job, cfg) {
  const title = String(job.title || '');
  const description = String(job.descriptionText || '');
  const haystack = `${title} ${description}`;
  const maxAllowed = cfg.experience.max_years;
  const fresherSignals = cfg.experience.fresher_role_signals || [];
  const excludeTitleWords = cfg.roles.exclude_title_keywords || [];

  const titleSeniorSignal = TITLE_SENIOR_WORDS.test(title) || ROMAN_SUFFIX.test(title) ||
    ROLE_LEVEL_SUFFIX.test(title) ||
    excludeTitleWords.some((w) => buildSignalRegex(w).test(title));
  const anySeniorSignal = titleSeniorSignal || TITLE_SENIOR_WORDS.test(description);
  const titleFresherSignal = anyMatch(title, fresherSignals);

  // Structured experience field (e.g. JSearch's "N months") isn't
  // authoritative on its own — it can under-report vs. the JD text — but a
  // clear over-threshold figure is still a fast, safe exclude.
  const monthsMatch = String(job.experienceText || '').match(MONTHS_FIGURE);
  if (monthsMatch) {
    const years = Number(monthsMatch[1]) / 12;
    if (years > maxAllowed && !titleFresherSignal) {
      return exclude(0, years, `structured experience field: ${monthsMatch[1]} months`);
    }
  }

  const { openEnded, ranges, singles } = extractRange(haystack);

  // Hard excludes. A fresher signal can only override an open-ended or
  // borderline figure when it's in the *title* — a stray "intern"/"trainee"
  // mention buried in a long JD body (e.g. "manages our internship
  // program") is not a reliable enough signal to let a 3-5 yr role through,
  // and the brief's ambiguity policy is explicit that this override is
  // title-scoped. Never overrides a title seniority word either way.
  if (titleSeniorSignal) {
    return exclude(null, null, 'senior/lead/manager-type title');
  }

  if (openEnded.length && !titleFresherSignal) {
    const worst = Math.max(...openEnded);
    return exclude(worst, null, `open-ended experience requirement (${worst}+ years)`);
  }

  if (ranges.length) {
    const minOfRanges = Math.min(...ranges.map(([a]) => a));
    const maxOfRanges = Math.max(...ranges.map(([, b]) => b));
    if (minOfRanges > maxAllowed) {
      return exclude(minOfRanges, maxOfRanges, `requires ${minOfRanges}-${maxOfRanges} years`);
    }
    if (maxOfRanges > maxAllowed) {
      if (titleFresherSignal) {
        return include(minOfRanges, maxOfRanges, roleTypeFromSignals(haystack), 'medium',
          `range extends to ${maxOfRanges} yrs but the title carries a fresher signal`, true);
      }
      return exclude(minOfRanges, maxOfRanges, `range extends beyond ${maxAllowed} yrs (${minOfRanges}-${maxOfRanges})`);
    }
    return include(minOfRanges, maxOfRanges, roleTypeFromSignals(haystack), 'high', `requires ${minOfRanges}-${maxOfRanges} years`);
  }

  if (singles.length) {
    const min = Math.min(...singles);
    if (min > maxAllowed && !titleFresherSignal) {
      return exclude(min, min, `requires ${min} years experience`);
    }
    if (min <= maxAllowed) {
      return include(min, maxAllowed, roleTypeFromSignals(haystack), 'high', `requires ${min} years experience`);
    }
  }

  if (anySeniorSignal && !titleFresherSignal) {
    return exclude(null, null, 'seniority signal in requirements, no offsetting title fresher signal');
  }

  // No numeric signal at all past this point.
  if (titleFresherSignal) {
    // Ambiguity policy: years unknown, the title carries fresher-role
    // wording -> include, but flagged low-confidence since there's no hard
    // number backing it.
    return include(0, maxAllowed, roleTypeFromSignals(haystack), 'medium',
      'title carries fresher-role wording, no explicit years figure', true);
  }

  if (titleSeniorSignal || anySeniorSignal) {
    return exclude(null, null, 'seniority signal, no years figure to confirm otherwise');
  }

  return {
    decision: 'undecided',
    min_years: null,
    max_years: null,
    role_type: null,
    confidence: 'low',
    reason: 'no experience figure or fresher/senior wording found — deferring to Stage B',
    low_confidence: true,
  };
}

function include(minYears, maxYears, roleType, confidence, reason, lowConfidence = false) {
  return {
    decision: 'include',
    min_years: minYears,
    max_years: maxYears,
    role_type: roleType,
    confidence,
    reason,
    low_confidence: lowConfidence,
  };
}

function exclude(minYears, maxYears, reason) {
  return {
    decision: 'exclude',
    min_years: minYears,
    max_years: maxYears,
    role_type: null,
    confidence: 'high',
    reason,
    low_confidence: false,
  };
}
