// Collapses the same posting surfaced by multiple sources (Naukri +
// LinkedIn + a company's own career page, etc.) into one record. Groups by
// company + location + the ISO week it was posted, then fuzzy-matches
// titles within each group (exact string equality is too brittle — sources
// format the same title differently). Keeps the richest record per group.

function normalizeToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isoWeek(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown-week';
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function groupKey(job) {
  const company = normalizeToken(job.company);
  const location = job.locationCanonical || 'unknown';
  const week = isoWeek(job.postedAt);
  return `${company}|${location}|${week}`;
}

// Token-set Jaccard similarity — cheap, dependency-free, good enough to
// catch "Software Engineer - Fresher" vs "Software Engineer (Fresher)".
function titleSimilarity(a, b) {
  const setA = new Set(normalizeToken(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeToken(b).split(' ').filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const TITLE_SIMILARITY_THRESHOLD = 0.7;
const REDIRECT_URL_HINTS = /adzuna\.com\/land|rapidapi|jsearch|\/redirect\b|\/click\b/i;

function richnessScore(job) {
  let score = 0;
  score += job.descriptionText ? 2 : 0;
  score += job.descriptionText ? Math.min(job.descriptionText.length / 1000, 2) : 0;
  score += job.compensationText || job.compensation?.compensation_disclosed ? 1 : 0;
  score += job.companyLogo ? 1 : 0;
  score += REDIRECT_URL_HINTS.test(job.url || '') ? 0 : 2; // prefer the most direct apply link
  score += job.tags?.length ? 0.5 : 0;
  return score;
}

// Returns the deduped job list, each survivor annotated with
// duplicate_count (how many raw postings collapsed into it).
export function dedupeJobs(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const key = groupKey(job);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }

  const out = [];
  for (const groupJobs of groups.values()) {
    const clusters = []; // [{ representative, members: [] }]
    for (const job of groupJobs) {
      const cluster = clusters.find((c) => titleSimilarity(c.representative.title, job.title) >= TITLE_SIMILARITY_THRESHOLD);
      if (cluster) {
        cluster.members.push(job);
        if (richnessScore(job) > richnessScore(cluster.representative)) cluster.representative = job;
      } else {
        clusters.push({ representative: job, members: [job] });
      }
    }
    for (const cluster of clusters) {
      out.push({ ...cluster.representative, duplicate_count: cluster.members.length });
    }
  }
  return out;
}
