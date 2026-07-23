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
import { classifyMatchAndScam } from './llm/matchScam.js';
import { verifyApplyLink } from './verify/linkChecker.js';
import { scoreJob } from './scoring.js';
import { logFunnel, logExcluded, logUnclear, logScamFlagged, logExcludedByVerification } from './logging.js';
import { excerpt } from './util/html.js';
import { mapConcurrent } from './util/fetchJson.js';
import { withLLMCache, ttlForVerdict } from './llmCache.js';

function isFresh(postedAt, maxAgeDays) {
  const t = new Date(postedAt).getTime();
  if (!Number.isFinite(t)) return true;
  const ageMs = Date.now() - t;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs && ageMs >= -2 * 24 * 60 * 60 * 1000;
}

// A posting whose stated application deadline has already passed is dead —
// no point running it through the (expensive) two-gate LLM pipeline or
// verifying its apply link. No known deadline (the common case — most
// postings don't state one) is NOT the same as "expired": unknown stays
// active by default, matching the codebase's general "unknown != reject"
// stance elsewhere.
function isDeadlineActive(applyBy) {
  if (!applyBy) return true;
  const t = new Date(applyBy).getTime();
  if (!Number.isFinite(t)) return true;
  return t >= Date.now();
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

  const active = enriched.filter((job) => isDeadlineActive(job.applyBy));

  // Experience gate and role gate are independent — evaluated in parallel
  // per job, never chained, never sharing state. A job is kept only if
  // BOTH say eligible (AND, composed here — neither gate's internals know
  // the other exists). See server/src/filters/roleTier12.js's header for
  // why they must stay separate functions.
  const classified = await mapConcurrent(
    active,
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
    // produces two log lines, not one merged verdict. Only a genuine
    // 'exclude' verdict drops a job — 'unclear' (LLM stage unavailable,
    // failed, or below-confidence) is kept, never silently dropped, per the
    // spec's ambiguity policy.
    if (job.fresher.verdict === 'exclude') {
      excludedByExperience += 1;
      if (!opts.silent) logExcluded(job, job.fresher, 'experience');
    }
    if (job.role.verdict === 'exclude') {
      excludedByRole += 1;
      if (!opts.silent) logExcluded(job, job.role, 'role');
    }
    if (job.fresher.verdict !== 'exclude' && job.role.verdict !== 'exclude') {
      const status = (job.fresher.verdict === 'unclear' || job.role.verdict === 'unclear') ? 'unclear' : 'new';
      if (status === 'unclear' && !opts.silent) logUnclear(job, job.fresher, job.role);
      kept.push({ ...job, status });
    }
  }

  // Match/scam classification + apply-link verification only run on jobs
  // that already survived both gates + dedupe (`kept`) — a much smaller set
  // than `classified`, so this doesn't multiply LLM/network call volume.
  // scam_flag forces status to 'unclear' regardless of match score, per the
  // spec's anti-fake-listing rule — a scam-shaped posting is never a clean
  // "New" even if both gates liked it.
  // opts.skipVerification skips the real HEAD/GET network probe (used by
  // --dry-run and tests, neither of which should make live network calls
  // against fixture URLs) — match/scam classification already degrades to
  // a safe no-op without GEMINI_API_KEY, so it needs no equivalent flag.
  const verify = opts.skipVerification
    ? async () => ({ verified: false, officialLink: null, expiredLink: null })
    : verifyApplyLink;

  const enrichedKept = await mapConcurrent(
    kept,
    cfg.rate_limits.max_concurrent_per_source,
    async (job) => {
      const [matchScam, verifyResult] = await Promise.all([
        withLLMCache(`matchScam:${job.id}`, () => classifyMatchAndScam(job, cfg), ttlForVerdict),
        verify(job.url),
      ]);
      const status = matchScam.scam_flag ? 'unclear' : job.status;
      if (matchScam.scam_flag && job.status !== 'unclear' && !opts.silent) {
        logScamFlagged(job, matchScam);
      }
      return {
        ...job,
        status,
        officialLink: verifyResult.officialLink,
        expiredLink: verifyResult.expiredLink,
        matchScore: matchScam.match_score,
        keySkills: matchScam.key_skills,
        resumeBullets: matchScam.resume_bullets,
        scamFlag: matchScam.scam_flag,
        scamReason: matchScam.scam_reason,
        verified: verifyResult.verified,
      };
    },
  );

  // A definitive verification result overrides everything else — this is
  // the one place a job gets dropped AFTER already clearing both gates.
  // Only a *confirmed* false/true drops it: officialLink === null (fetch
  // failed, so the real destination domain is unknown) or expiredLink ===
  // null/false never do — an unreachable link stays "unverified, kept",
  // same as before this existed.
  let excludedByVerification = 0;
  const verifiedKept = enrichedKept.filter((job) => {
    if (job.officialLink === false) {
      excludedByVerification += 1;
      if (!opts.silent) logExcludedByVerification(job, 'apply link resolves to a known third-party/aggregator domain, not the official company page');
      return false;
    }
    if (job.expiredLink === true) {
      excludedByVerification += 1;
      if (!opts.silent) logExcludedByVerification(job, 'apply link page indicates the posting is closed/expired');
      return false;
    }
    return true;
  });

  const jobs = verifiedKept.map((job) => ({
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
    status: job.status,
    verified: job.verified,
    matchScore: job.matchScore,
    keySkills: job.keySkills,
    resumeBullets: job.resumeBullets,
    scamFlag: job.scamFlag,
    scamReason: job.scamReason,
    duplicateCount: job.duplicate_count || 1,
    fitScore: scoreJob(job, cfg),
  }));

  const finalUnclearCount = jobs.filter((j) => j.status === 'unclear').length;

  // afterRoleGate / afterExperienceGate are each computed against the full
  // deduped set independently (not sequentially, not off each other's
  // leftovers) — this is what shows you which gate is doing the filtering,
  // per the --dry-run funnel output (npm run dry-run from server/). A job
  // counts here as long as its gate didn't confidently exclude it — an
  // 'unclear' verdict still passes its own gate, it just isn't a clean
  // "New" once both gates are combined below.
  const funnel = {
    fetched: rawJobs.length,
    afterLocationFilter: withLocation.length,
    afterFreshness: fresh.length,
    afterDedupe: deduped.length,
    afterDeadlineFilter: active.length,
    afterRoleGate: classified.filter((j) => j.role.verdict !== 'exclude').length,
    afterExperienceGate: classified.filter((j) => j.fresher.verdict !== 'exclude').length,
    excludedByRole,
    excludedByExperience,
    excludedByVerification,
    kept: jobs.length,
    unclear: finalUnclearCount,
  };

  if (!opts.silent) logFunnel(funnel);

  return { jobs, funnel };
}
