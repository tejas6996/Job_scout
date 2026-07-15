// Fit score for "Best match" sort, re-tuned for the India-fresher scope.
// There's no US-specific weight to remove here — the old dashboard had no
// scoring model at all, just a sort by fresher-confidence then postedAt
// (server/src/routes/jobs.js before this refactor). This replaces that.
//
// Design decision: this dashboard has no per-user profile (unlike the
// separate Notion-backed pipeline on the soorya branch), so "skill overlap"
// is approximated against config/india.yaml's roles.include_keywords rather
// than a personal skill list. Swap in a real profile source later without
// changing this function's shape — it just needs a keyword list in.
import { isPriorityLocation, allCanonicalLocations } from './location.js';

const WEIGHTS = {
  skillOverlap: 30,
  locationMatch: 20,
  roleType: 15,
  compensationDisclosed: 10,
  recency: 15,
  deadlineUrgency: 10,
  // Role-taxonomy fit (config/roles.yaml) — additive, everything above is
  // unchanged. A job only reaches scoring at all if it already passed the
  // role gate (server/src/filters/roleTier12.js / roleTier3.js), so this is
  // about ranking among already-eligible roles, not a second filter.
  roleFit: 20,
  roleFitPriorityBoost: 10,
};

function skillOverlapScore(job, keywords) {
  if (!keywords?.length) return 0;
  const haystack = `${job.title} ${job.descriptionText || ''}`.toLowerCase();
  const hits = keywords.filter((k) => haystack.includes(k.toLowerCase())).length;
  return Math.min(1, hits / Math.min(keywords.length, 6)) * WEIGHTS.skillOverlap;
}

function locationMatchScore(job) {
  if (!job.locationCanonical) return 0;
  if (isPriorityLocation(job.locationCanonical)) return WEIGHTS.locationMatch;
  if (allCanonicalLocations().includes(job.locationCanonical)) return WEIGHTS.locationMatch * 0.5;
  return 0;
}

const ROLE_TYPE_SCORE = {
  internship: 1,
  trainee: 1,
  full_time_entry: 1,
  apprenticeship: 0.8,
};

function roleTypeScore(job) {
  const factor = ROLE_TYPE_SCORE[job.fresher?.role_type] ?? 0.3;
  return factor * WEIGHTS.roleType;
}

function compensationScore(job) {
  return job.compensation?.compensation_disclosed ? WEIGHTS.compensationDisclosed : 0;
}

const ROLE_TIER_FACTOR = { core: 1, adjacent: 0.5 };

function roleFitScore(job, cfg) {
  const role = job.role;
  if (!role?.eligible || !role.tier) return 0;
  const factor = ROLE_TIER_FACTOR[role.tier] ?? 0.5;
  const priorityFamilies = cfg.roleTaxonomy?.priority_families || [];
  const priorityBoost = priorityFamilies.includes(role.family) ? WEIGHTS.roleFitPriorityBoost : 0;
  return factor * WEIGHTS.roleFit + priorityBoost;
}

function recencyScore(job, maxAgeDays) {
  const postedMs = Date.parse(job.postedAt);
  if (!Number.isFinite(postedMs)) return 0;
  const ageDays = (Date.now() - postedMs) / (24 * 60 * 60 * 1000);
  const fraction = Math.max(0, 1 - ageDays / Math.max(maxAgeDays, 1));
  return fraction * WEIGHTS.recency;
}

function deadlineUrgencyScore(job) {
  if (!job.applyBy) return 0;
  const daysLeft = (Date.parse(job.applyBy) - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysLeft <= 0) return 0; // deadline already passed — no urgency bonus
  if (daysLeft <= 3) return WEIGHTS.deadlineUrgency;
  if (daysLeft <= 7) return WEIGHTS.deadlineUrgency * 0.6;
  return WEIGHTS.deadlineUrgency * 0.3;
}

export function scoreJob(job, cfg) {
  const keywords = cfg.roles.include_keywords || [];
  const total =
    skillOverlapScore(job, keywords) +
    locationMatchScore(job) +
    roleTypeScore(job) +
    compensationScore(job) +
    recencyScore(job, cfg.freshness.max_age_days) +
    deadlineUrgencyScore(job) +
    roleFitScore(job, cfg);
  return Math.round(total);
}
