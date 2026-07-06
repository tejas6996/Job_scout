import { hashString } from './util/http.js';

// Mirrors the "Filter Jobs" code node, verbatim regex logic.
const ROLE_INCLUDE =
  /(data analyst|data engineer|business analyst|bi analyst|business intelligence|analytics engineer|machine learning|ml engineer|ai engineer|data science)/i;
// Word-bounded so "leader"/"leadership", "architecture", and "managerial" in
// generic JD boilerplate don't falsely trip on "lead"/"architect"/"manager".
const EXP_EXCLUDE =
  /(\bsenior\b|\bsr\.?\b|\blead(s)?\b|\bprincipal\b|\bstaff\b|\bmanager(s)?\b|\bhead of\b|\barchitect(s)?\b|\bdirector(s)?\b|(?:[3-9]|\d{2})\s*\+?\s*(?:yrs?|years?)|[3-9]\s*[-–]\s*\d+\s*(?:yrs?|years?))/i;
const EXP_INCLUDE =
  /(fresher|intern(?:ship)?|apprentice|trainee|entry[\s-]?level|graduate\s(?:engineer|trainee)|campus|junior|0\s*[-–to\s]{0,4}[12]\s*\+?\s*(?:yrs?|years?))/i;

function locationOk(loc, source, includeRemote) {
  const l = (loc || '').toLowerCase();
  if (source === 'Alert') return true;
  // No location metadata at all — trust the source query's own city scoping
  // (Adzuna's `where=`, JSearch's "... jobs in <LOCATION>") rather than reject.
  if (!l) return true;
  if (/bangalore|bengaluru/.test(l)) return true;
  if (includeRemote && /remote/.test(l)) return true;
  return false;
}

export function filterJobs(jobs, cfg) {
  const maxAgeMs = cfg.MAX_DAYS * 24 * 60 * 60 * 1000;
  const maxExpMonths = cfg.MAX_EXPERIENCE_YEARS * 12;
  const now = Date.now();
  const out = [];

  for (const j of jobs) {
    const haystack = `${j.title || ''} ${j.description || ''}`;
    if (!ROLE_INCLUDE.test(haystack)) continue;
    if (!locationOk(j.location, j.source, cfg.INCLUDE_REMOTE)) continue;

    if (j.posted_at) {
      const postedMs = Date.parse(j.posted_at);
      if (!Number.isNaN(postedMs) && now - postedMs > maxAgeMs) continue;
    }

    let status = 'New';
    const structuredMonths =
      j.experience_text && /\d+\s*months/.test(j.experience_text)
        ? parseInt(j.experience_text, 10)
        : null;

    // A source's structured experience field (e.g. JSearch's
    // required_experience_in_months) is not authoritative on its own — it can
    // under-report relative to what the actual JD text says. Always check the
    // exclude regex against the JD text, never skip it just because a
    // structured number happened to be present and in-range.
    if (structuredMonths !== null && structuredMonths > maxExpMonths) continue;
    if (EXP_EXCLUDE.test(haystack)) continue;

    if (structuredMonths === null) {
      if (EXP_INCLUDE.test(haystack)) {
        // passes
      } else {
        status = 'Unclear';
      }
    }

    const hashSource = `${(j.company || '').toLowerCase()}|${(j.title || '').toLowerCase()}|${(
      j.apply_link || ''
    ).toLowerCase()}`;
    out.push({ ...j, status, job_hash: `h_${hashString(hashSource)}` });
  }

  return out;
}

// Mirrors "Remove Duplicates" (compare on job_hash, keep first occurrence).
export function dedupeByHash(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    if (seen.has(j.job_hash)) continue;
    seen.add(j.job_hash);
    out.push(j);
  }
  return out;
}
