// In-memory cache of the aggregated job pool, kept fresh two ways:
//  1. On-demand: an /api/jobs request past CACHE_TTL_MS triggers a refresh.
//  2. Proactively: startBackgroundRefresh() re-polls every source on a timer
//     (config/india.yaml -> rate_limits.background_refresh_minutes) so the
//     pool updates even if nobody's loading the dashboard right then —
//     the next page load or client poll just sees already-fresh data
//     instead of paying the fetch latency itself.
// Concurrent refreshes (on-demand + background landing at the same time)
// share a single in-flight promise, and if a refresh fails we keep serving
// the last good snapshot (stale-while-error).
import { fetchAllJobs } from './sources/index.js';
import { loadConfig } from './config/loadConfig.js';

const TTL = Number(process.env.CACHE_TTL_MS || 30 * 60 * 1000);

let snapshot = null; // { jobs, meta, updatedAt }
let fetchedAt = 0;
let inFlight = null;

function refresh() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { jobs, meta } = await fetchAllJobs();
      snapshot = { jobs, meta, updatedAt: new Date().toISOString() };
      fetchedAt = Date.now();
      return snapshot;
    } catch (err) {
      if (snapshot) return snapshot; // serve stale data rather than failing
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function getPool() {
  const isFresh = snapshot && Date.now() - fetchedAt < TTL;
  if (isFresh) return snapshot;
  return refresh();
}

export function startBackgroundRefresh() {
  const cfg = loadConfig();
  const minutes = cfg.rate_limits?.background_refresh_minutes || 15;
  const intervalMs = minutes * 60 * 1000;

  console.log(`[job-scout] background refresh every ${minutes}m`);
  const timer = setInterval(() => {
    refresh().catch((err) => console.error('[job-scout] background refresh failed:', err.message));
  }, intervalMs);
  timer.unref?.(); // don't keep the process alive on its own (tests, scripts)

  refresh().catch((err) => console.error('[job-scout] initial background refresh failed:', err.message));

  return () => clearInterval(timer);
}
