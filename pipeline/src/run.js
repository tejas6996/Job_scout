import { getProfileText, getExistingJobIds, createJobPage } from './notion.js';
import { fetchJSearchJobs } from './sources/jsearch.js';
import { fetchAdzunaJobs } from './sources/adzuna.js';
import { fetchAtsJobs } from './sources/ats.js';
import { fetchRssJobs } from './sources/rss.js';
import { filterJobs, dedupeByHash } from './filter.js';
import { verifyApplyLink } from './verify.js';
import { scoreJobWithGemini } from './llm.js';
import { mapConcurrent } from './util/http.js';

const SOURCES = [
  ['JSearch', fetchJSearchJobs],
  ['Adzuna', fetchAdzunaJobs],
  ['ATS', fetchAtsJobs],
  ['RSS', fetchRssJobs],
];

// Full port of the "Job Scout" n8n workflow: read the profile + existing
// jobs from Notion, fan out to every job source, filter/dedupe/verify/score,
// then write new matches back to Notion.
export async function runPipeline(cfg) {
  const profileText = await getProfileText(cfg);
  const existingJobIds = await getExistingJobIds(cfg);

  const settled = await Promise.allSettled(SOURCES.map(([, fetchFn]) => fetchFn(cfg)));
  const fetched = [];
  settled.forEach((result, i) => {
    const [name] = SOURCES[i];
    if (result.status === 'fulfilled') {
      fetched.push(...result.value);
    } else {
      console.warn(`[job-scout] source ${name} failed:`, result.reason?.message || result.reason);
    }
  });

  const filtered = filterJobs(fetched, cfg);
  const deduped = dedupeByHash(filtered);
  const newJobs = deduped.filter((j) => !existingJobIds.has(j.job_id));

  const verified = await mapConcurrent(newJobs, 5, (j) => verifyApplyLink(j));
  // Strict gate: a job whose apply link doesn't actually resolve never reaches
  // Notion, full stop — no LLM scoring wasted on it either.
  const reachable = verified.filter((j) => j.verified);
  const scored = await mapConcurrent(reachable, 3, (j) => scoreJobWithGemini(j, profileText, cfg));

  let created = 0;
  await mapConcurrent(scored, 3, async (job) => {
    await createJobPage(job, cfg);
    created++;
  });

  const summary = {
    fetched: fetched.length,
    afterFilter: filtered.length,
    afterDedupe: deduped.length,
    new: newJobs.length,
    verifiedReachable: reachable.length,
    unreachableDropped: verified.length - reachable.length,
    created,
  };
  console.log('[job-scout] run complete', summary);
  return summary;
}
