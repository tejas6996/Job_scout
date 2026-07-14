// The provider/adapter contract every job source must conform to. Adding a
// new source means writing one file that exports SOURCE_NAME + fetchJobs(cfg)
// returning an array shaped like RAW_JOB_SHAPE — nothing else in the
// pipeline should need to know which source a job came from.
//
// RAW_JOB_SHAPE (all fields required, use '' / null / [] / false when a
// source doesn't provide something — never omit a key):
//   id               string   stable per-source unique id
//   source           string   must equal the provider's SOURCE_NAME
//   title            string
//   company          string
//   companyLogo      string | null
//   url              string   apply / listing link
//   location         string   raw, unnormalized — location.js canonicalizes it later
//   remote           boolean
//   postedAt         string   ISO 8601
//   tags             string[]
//   category         string | null
//   jobType          string | null
//   rawLevel         string   source-provided seniority hint, if any
//   descriptionText  string   plain text, HTML stripped
//   compensationText string   raw text to feed compensation.js (salary line, stipend line, or '')
//   experienceText   string   raw text to feed the fresher filter (e.g. "0-2 years", "6 months")

const REQUIRED_KEYS = [
  'id', 'source', 'title', 'company', 'companyLogo', 'url', 'location', 'remote',
  'postedAt', 'tags', 'category', 'jobType', 'rawLevel', 'descriptionText',
  'compensationText', 'experienceText',
];

// Fills in safe defaults for any missing key and drops jobs missing the
// bare minimum (title + url) — used by every provider's normalize step so a
// source's quirks can never crash the pipeline.
export function normalizeProviderJob(job, sourceName) {
  if (!job || !job.url || !job.title) return null;
  const out = { source: sourceName };
  for (const key of REQUIRED_KEYS) {
    out[key] = key in job ? job[key] : defaultFor(key);
  }
  out.source = sourceName;
  return out;
}

function defaultFor(key) {
  if (key === 'remote') return false;
  if (key === 'tags') return [];
  if (key === 'category' || key === 'jobType' || key === 'companyLogo') return null;
  return '';
}

export function isValidProviderJob(job) {
  return Boolean(job && job.title && job.url && job.source);
}
