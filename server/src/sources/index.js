// Fans out to every enabled provider and hands the raw results to the
// shared pipeline (server/src/pipeline.js) for filtering/dedupe/scoring.
//
// Each provider has its own refresh cadence (config/india.yaml ->
// rate_limits.source_refresh_minutes, falling back to
// rate_limits.background_refresh_minutes) rather than all sharing pool.js's
// tick interval — pool.js still calls fetchAllJobs() every tick, but a
// source whose own interval hasn't elapsed just reuses its last cached
// result instead of hitting the network again. This exists because sources
// have wildly different quotas: Adzuna/Greenhouse/Lever can take a fetch
// every tick, but a quota-limited key (JSearch) needs a much slower one.
import * as jobicy from './jobicy.js';
import * as remotive from './remotive.js';
import * as adzuna from './adzuna.js';
import * as jsearch from './jsearch.js';
import * as atsBoards from './atsBoards.js';
import { loadConfig } from '../config/loadConfig.js';
import { runPipeline } from '../pipeline.js';

const PROVIDERS = { jobicy, remotive, adzuna, jsearch, ats_boards: atsBoards };
export const PROVIDER_NAMES = Object.keys(PROVIDERS);

const sourceCache = new Map(); // name -> { rawJobs, fetchedAt }

function enabledProviders(cfg) {
  return Object.entries(PROVIDERS).filter(([name]) => cfg.sources[name]);
}

function refreshIntervalMs(cfg, name) {
  const minutes = cfg.rate_limits?.source_refresh_minutes?.[name] ?? cfg.rate_limits?.background_refresh_minutes ?? 15;
  return minutes * 60 * 1000;
}

async function getProviderResult(name, mod, cfg) {
  const cached = sourceCache.get(name);
  const isFresh = cached && Date.now() - cached.fetchedAt < refreshIntervalMs(cfg, name);
  if (isFresh) return { rawJobs: cached.rawJobs, meta: { source: name, ok: true, count: cached.rawJobs.length, cached: true } };

  try {
    const rawJobs = await mod.fetchJobs(cfg);
    sourceCache.set(name, { rawJobs, fetchedAt: Date.now() });
    return { rawJobs, meta: { source: name, ok: true, count: rawJobs.length, cached: false } };
  } catch (err) {
    if (cached) return { rawJobs: cached.rawJobs, meta: { source: name, ok: false, count: cached.rawJobs.length, cached: true, error: String(err.message || err) } };
    return { rawJobs: [], meta: { source: name, ok: false, count: 0, cached: false, error: String(err.message || err) } };
  }
}

export async function fetchAllJobs() {
  const cfg = loadConfig();
  const providers = enabledProviders(cfg);

  const results = await Promise.all(providers.map(([name, mod]) => getProviderResult(name, mod, cfg)));

  const rawJobs = results.flatMap((r) => r.rawJobs);
  const meta = results.map((r) => r.meta);

  const { jobs } = await runPipeline(rawJobs, cfg);
  return { jobs, meta };
}
