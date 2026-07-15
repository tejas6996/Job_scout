// The shared processing pipeline: raw provider jobs in, India-filtered /
// deduped / classified / scored jobs out. Used by both the live pool
// (server/src/sources/index.js, fed from real providers) and --dry-run /
// tests (fed from tests/fixtures/*.json) so there is exactly one code path
// for "what does a raw job go through," never two that can drift apart.
import { canonicalizeLocation, isInScope } from './location.js';
import { parseCompensation } from './compensation.js';
import { extractApplyDeadline } from './deadline.js';
import { dedupeJobs } from './dedupe.js';
import { classifyFresher, classifyRole } from './filters/index.js';
import { scoreJob } from './scoring.js';
import { logFunnel, logExcluded } from './logging.js';
import { excerpt } from './util/html.js';
import { mapConcurrent } from './util/fetchJson.js';

function isFresh(postedAt, maxAgeDays) {
  const t = new Date(postedAt).getTime();
  if (!Number.isFinite(t)) return true;
  const ageMs = Date.now() - t;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs && ageMs >= -2 * 24 * 60 * 60 * 1000;
}

// opts.silent suppresses funnel/excluded-job logging (used by tests, which
// run this many times and don't want a log/ directory full of noise).
export async function runPipeline(rawJobs, cfg, opts = {}) {
  const withLocation = rawJobs
    .map((job) => ({ ...job, locationCanonical: canonicalizeLocation(job.location) }))
    .filter((job) => job.locationCanonical !== null && isInScope(job.locationCanonical));

  const fresh = withLocation.filter((job) => isFresh(job.postedAt, cfg.freshness.max_age_days));
  const deduped = dedupeJobs(fresh);

  const enriched = deduped.map((job) => ({
    ...job,
    compensation: parseCompensation(job.compensationText || job.descriptionText),
    applyBy: extractApplyDeadline(job.descriptionText),
  }));

  // Experience gate and role gate are independent — evaluated in parallel
  // per job, never chained, never sharing state. A job is kept only if
  // BOTH say eligible (AND, composed here — neither gate's internals know
  // the other exists). See server/src/filters/roleTier12.js's header for
  // why they must stay separate functions.
  const classified = await mapConcurrent(
    enriched,
    cfg.rate_limits.max_concurrent_per_source,
    async (job) => {
      const [fresher, role] = await Promise.all([classifyFresher(job, cfg), classifyRole(job, cfg)]);
      return { ...job, fresher, role };
    },
  );

  const kept = [];
  let excludedByExperience = 0;
  let excludedByRole = 0;
  for (const job of classified) {
    // Each gate's rejection is logged independently — a job failing both
    // produces two log lines, not one merged verdict.
    if (!job.fresher.eligible) {
      excludedByExperience += 1;
      if (!opts.silent) logExcluded(job, job.fresher, 'experience');
    }
    if (!job.role.eligible) {
      excludedByRole += 1;
      if (!opts.silent) logExcluded(job, job.role, 'role');
    }
    if (job.fresher.eligible && job.role.eligible) kept.push(job);
  }

  const jobs = kept.map((job) => ({
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo,
    url: job.url,
    location: job.location,
    locationCanonical: job.locationCanonical,
    remote: job.remote,
    postedAt: job.postedAt,
    applyBy: job.applyBy,
    tags: job.tags,
    category: job.category,
    jobType: job.jobType,
    compensation: job.compensation,
    excerpt: excerpt(job.descriptionText, 220),
    fresher: job.fresher,
    role: job.role,
    duplicateCount: job.duplicate_count || 1,
    fitScore: scoreJob(job, cfg),
  }));

  // afterRoleGate / afterExperienceGate are each computed against the full
  // deduped set independently (not sequentially, not off each other's
  // leftovers) — this is what shows you which gate is doing the filtering,
  // per the --dry-run funnel output (npm run dry-run from server/).
  const funnel = {
    fetched: rawJobs.length,
    afterLocationFilter: withLocation.length,
    afterFreshness: fresh.length,
    afterDedupe: deduped.length,
    afterRoleGate: classified.filter((j) => j.role.eligible).length,
    afterExperienceGate: classified.filter((j) => j.fresher.eligible).length,
    excludedByRole,
    excludedByExperience,
    kept: jobs.length,
  };

  if (!opts.silent) logFunnel(funnel);

  return { jobs, funnel };
}
