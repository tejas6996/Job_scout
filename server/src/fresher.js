// Heuristic that decides whether a posting is a good fit for a "fresher"
// (someone with <= 3 years of experience). Job boards rarely expose a clean
// "years required" field, so we infer it from the title, tags, an optional
// source-provided level, and the description text.
//
// This is intentionally conservative on the exclude side: a role that clearly
// demands senior experience is dropped, while ambiguous roles are kept but
// flagged with lower confidence so a fresher can still decide for themselves.

const SENIOR_TITLE =
  /\b(senior|snr|sr\.?|lead|principal|staff|head\s+of|vp\b|vice[\s-]?president|director|architect|expert|manager|chief|c[te]o|cxo|partner|leiter|leitung|gesch(a|ä)ftsf(u|ü)hr|teamlead|berufserfahren)\w*/i;

// Positive "fresher" signals, including common German-language equivalents
// (Arbeitnow is Europe/DE-heavy): Praktikum=internship, Werkstudent=working
// student, Ausbildung=apprenticeship, Absolvent=graduate, Einsteiger=starter.
const JUNIOR_SIGNAL =
  /\b(junior|jr\.?|entry[\s-]?level|graduate|new[\s-]?grad|trainee|fresher|freshers|internship|intern\b|apprentice|apprenticeship|early[\s-]?career|working[\s-]?student|werkstudent|praktikum|praktikant\w*|ausbildung|auszubildende\w*|absolvent\w*|berufseinsteiger\w*|einsteiger|duales?\s+studium)\b/i;

const INTERN_SIGNAL =
  /\b(intern\b|internship|apprentice|apprenticeship|working[\s-]?student|werkstudent|praktikum|praktikant\w*|ausbildung)\b/i;

const SENIOR_LEVEL_FIELD =
  /\b(senior|principal|lead|expert|director|executive|manager|head|berufserfahren\w*)\b/i;

const NO_EXPERIENCE = /\b(no\s+experience|0\s*years?|zero\s+experience|entry[\s-]?level)\b/i;

// Pull every plausible "years of experience required" figure out of the text
// and return the smallest one — i.e. the easiest path to qualifying. Returns
// null when the posting says nothing about years.
export function extractRequiredYears(text = '') {
  if (!text) return null;
  const t = text.toLowerCase();
  const found = [];

  const push = (v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 40) found.push(n);
  };

  // "3+ years", "3 + yrs"
  for (const m of t.matchAll(/(\d{1,2})\s*\+\s*(?:years?|yrs?)/g)) push(m[1]);
  // "3-5 years", "3 to 5 years"
  for (const m of t.matchAll(/(\d{1,2})\s*(?:-|–|—|to)\s*\d{1,2}\s*(?:years?|yrs?)/g)) push(m[1]);
  // "minimum of 4 years", "at least 5 years", "min 2 years"
  for (const m of t.matchAll(/(?:minimum|min\.?|at\s+least)\s+(?:of\s+)?(\d{1,2})\s*(?:years?|yrs?)/g)) push(m[1]);
  // "4 years of experience"
  for (const m of t.matchAll(/(\d{1,2})\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|relevant\s+|work\s+)?experience/g)) push(m[1]);

  if (NO_EXPERIENCE.test(t)) push(0);
  if (!found.length) return null;
  return Math.min(...found);
}

// Returns { eligible, level, maxYears, confidence, reasons }.
//   level: 'internship' | 'entry' | 'junior' | 'open' | 'senior'
export function evaluateFresher({ title = '', tags = [], levelField = '', text = '' }) {
  const titleL = String(title).toLowerCase();
  const meta = `${title} ${(tags || []).join(' ')} ${levelField}`.toLowerCase();
  const full = `${meta} ${text}`.toLowerCase();
  const lvl = String(levelField).toLowerCase();

  const juniorSignal = JUNIOR_SIGNAL.test(meta);
  const seniorTitle = SENIOR_TITLE.test(titleL);
  const seniorLevelField = SENIOR_LEVEL_FIELD.test(lvl);
  const minYears = extractRequiredYears(full);

  // ---- Hard excludes (a genuine junior signal overrides these) ----
  if (!juniorSignal) {
    if (minYears !== null && minYears > 3) {
      return exclude(minYears, 'high', [`${minYears}+ yrs required`]);
    }
    if (seniorTitle) {
      return exclude(minYears, 'high', ['senior-level title']);
    }
    if (seniorLevelField) {
      return exclude(minYears, 'medium', [`source level: ${levelField}`]);
    }
  }

  // ---- Eligible: classify the seniority band ----
  if (INTERN_SIGNAL.test(meta)) {
    return include('internship', 'high', ['internship / apprenticeship']);
  }
  if (juniorSignal) {
    return include('entry', 'high', ['entry-level keyword']);
  }
  if (minYears !== null && minYears <= 3) {
    return include('junior', 'high', [`requires ${minYears} yr${minYears === 1 ? '' : 's'}`], minYears);
  }
  if (/\b(entry|junior|associate|graduate|intern)\b/.test(lvl)) {
    return include('entry', 'medium', [`source level: ${levelField}`]);
  }
  // No seniority barrier detected — open to freshers, but low confidence.
  return include('open', 'low', ['no seniority barrier found'], minYears);

  function include(level, confidence, reasons, maxYears = minYears) {
    return { eligible: true, level, maxYears, confidence, reasons };
  }
  function exclude(maxYears, confidence, reasons) {
    return { eligible: false, level: 'senior', maxYears, confidence, reasons };
  }
}
