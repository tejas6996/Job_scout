// Fans out to every enabled provider (Promise.allSettled — one dead source
// never takes down the rest) and hands the raw results to the shared
// pipeline (server/src/pipeline.js) for filtering/dedupe/scoring.
import * as jobicy from './jobicy.js';
import * as remotive from './remotive.js';
import * as adzuna from './adzuna.js';
import * as jsearch from './jsearch.js';
import * as atsBoards from './atsBoards.js';
import { loadConfig } from '../config/loadConfig.js';
import { runPipeline } from '../pipeline.js';

const PROVIDERS = { jobicy, remotive, adzuna, jsearch, ats_boards: atsBoards };
export const PROVIDER_NAMES = Object.keys(PROVIDERS);

function enabledProviders(cfg) {
  return Object.entries(PROVIDERS).filter(([name]) => cfg.sources[name]);
}

export async function fetchAllJobs() {
  const cfg = loadConfig();
  const providers = enabledProviders(cfg);

  const settled = await Promise.allSettled(providers.map(([, mod]) => mod.fetchJobs(cfg)));

  const rawJobs = [];
  const meta = [];

  settled.forEach((result, i) => {
    const [name] = providers[i];
    if (result.status === 'fulfilled') {
      rawJobs.push(...result.value);
      meta.push({ source: name, ok: true, count: result.value.length });
    } else {
      meta.push({ source: name, ok: false, count: 0, error: String(result.reason?.message || result.reason) });
    }
  });

  const { jobs } = await runPipeline(rawJobs, cfg);
  return { jobs, meta };
}
