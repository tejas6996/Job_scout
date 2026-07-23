// Role gate, Tier 1 (canonical/alias match) + Tier 2 (guarded keyword
// match for requires_data_signal families). Deterministic, no network —
// mirrors stageA.js's shape/philosophy but is a fully separate function:
// this never touches the experience gate and the experience gate never
// touches this. Composed with AND at the pipeline level (pipeline.js).
//
// Ambiguity policy: exclude_titles always wins, checked first, even for a
// bundled title. A title with no clean Tier 1/2 match and no
// data/analytics/ML/BI-ish token at all is default-denied without ever
// reaching Tier 3 (roleTier3.js, an LLM call) — precision over recall, and
// cheaper than paying for an LLM call on an obviously unrelated title.

// Title-cleaning mechanics — not taxonomy data, so these stay as code
// constants (same split stageA.js uses: TITLE_SENIOR_WORDS is code,
// fresher_role_signals is config). The taxonomy itself (families, aliases,
// exclude_titles, data_signal_keywords, title_prefilter_tokens) always
// comes from config/roles.yaml — nothing role-specific is hardcoded here.
const ROMAN_SUFFIX = /\b(ii|iii|iv)\b/gi;
// Same role-word-anchored level-suffix stripped here as in stageA.js's
// ROLE_LEVEL_SUFFIX, so "Data Analyst 3" normalizes to "data analyst" for
// family matching — the seniority exclusion itself lives in stageA.js
// (the experience gate), not here. Captures the role word so the
// replacement can keep it and drop only the trailing level marker.
const ROLE_LEVEL_SUFFIX = /\b(analyst|engineer|developer|scientist|consultant)\s*(?:[-\s]?[2-9]\b|\s*L[2-9]\b)/gi;
const JUNK_PHRASES = [
  'immediate joiner', 'urgent hiring', 'urgent requirement', 'hot vacancy',
  'walk[- ]?in', 'work from home', 'work from office', '\\bwfh\\b', '\\bwfo\\b',
];
const LOCATION_WORDS = [
  'bangalore', 'bengaluru', 'blr', 'hyderabad', 'mumbai', 'pune', 'delhi', 'ncr',
  'gurugram', 'gurgaon', 'chennai', 'noida', 'kolkata', 'ahmedabad', 'coimbatore',
  'remote', 'hybrid', 'india', 'pan india',
];

// Returns { normalized, bundled }. `bundled` flags a title that joins two
// role names with "&"/"/" (e.g. "Data & BI Analyst") — deliberately routed
// past Tier 1/2 to Tier 3 rather than letting a substring match on one half
// silently pick a family for a title that's actually naming two.
function normalizeTitle(rawTitle) {
  let t = String(rawTitle || '').toLowerCase();
  t = t.replace(/\([^)]*\)/g, ' '); // parenthetical junk: locations, batch years, "(Immediate Joiner)"
  t = t.replace(/[@|].*/g, ' '); // trailing "@ Company" / "| Company"
  for (const phrase of JUNK_PHRASES) t = t.replace(new RegExp(phrase, 'gi'), ' ');
  const locationAlt = LOCATION_WORDS.join('|');
  t = t.replace(new RegExp(`[-,]\\s*(${locationAlt})\\b.*$`, 'i'), ' '); // trailing "- Location" / ", Location"
  t = t.replace(ROMAN_SUFFIX, ' ');
  t = t.replace(ROLE_LEVEL_SUFFIX, '$1');

  const bundled = /[&/]/.test(t);

  t = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return { normalized: t, bundled };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPhrase(haystack, phrase) {
  const escaped = escapeRegExp(phrase.toLowerCase()).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

function anyPhraseMatches(haystack, phrases) {
  return (phrases || []).find((p) => matchesPhrase(haystack, p));
}

function findFamilyMatch(normalizedTitle, families) {
  for (const [key, family] of Object.entries(families)) {
    const candidates = [family.canonical, ...(family.aliases || [])];
    if (candidates.some((c) => matchesPhrase(normalizedTitle, c))) {
      return { key, family };
    }
  }
  return null;
}

function hasAnyToken(text, tokens) {
  const t = String(text || '');
  return (tokens || []).some((k) => matchesPhrase(t, k));
}

// Returns { decision: 'include'|'exclude'|'undecided', family, tier,
// has_data_signal, confidence, reason }.
export function evaluateRoleTier12(job, cfg) {
  const taxonomy = cfg.roleTaxonomy;
  const title = String(job.title || '');
  const { normalized, bundled } = normalizeTitle(title);

  const exclusionHit = anyPhraseMatches(normalized, taxonomy.exclude_titles);
  if (exclusionHit) {
    return reject(null, null, `title matches an excluded lookalike: "${exclusionHit}"`);
  }

  if (!bundled) {
    const match = findFamilyMatch(normalized, taxonomy.families);
    if (match) {
      const { key, family } = match;
      if (!family.requires_data_signal) {
        return include(key, family.tier, false, 'high', `matched "${family.canonical}" family (tier 1)`);
      }
      const hasSignal = hasAnyToken(job.descriptionText, taxonomy.data_signal_keywords);
      if (hasSignal) {
        return include(key, family.tier, true, 'high', `matched "${family.canonical}" with a data signal in the JD (tier 2)`);
      }
      return reject(key, family.tier, `matched "${family.canonical}" but no data signal found in the JD (tier 2 guard)`);
    }
  }

  const titleHasDataToken = hasAnyToken(normalized, taxonomy.title_prefilter_tokens);
  if (!titleHasDataToken) {
    return reject(null, null, 'no data/analytics/ML/BI-ish token in the title — default deny, not sent to Tier 3');
  }

  return {
    decision: 'undecided',
    family: null,
    tier: null,
    has_data_signal: null,
    confidence: 'low',
    reason: bundled
      ? 'bundled/compound title — deferring to Tier 3 rather than guessing which half applies'
      : 'title has a data-ish token but no clean Tier 1/2 match — deferring to Tier 3',
  };
}

function include(family, tier, hasDataSignal, confidence, reason) {
  return { decision: 'include', family, tier, has_data_signal: hasDataSignal, confidence, reason };
}

function reject(family, tier, reason) {
  return { decision: 'exclude', family, tier, has_data_signal: false, confidence: 'high', reason };
}

// Exported for tests that want to check normalization in isolation.
export { normalizeTitle };
