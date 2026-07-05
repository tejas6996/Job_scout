// In-memory, time-boxed cache of the aggregated job pool.
// This keeps the dashboard fast and is deliberately gentle on the free upstream
// APIs (we refresh at most once per TTL window). Concurrent requests during a
// refresh share a single in-flight promise, and if a refresh fails we keep
// serving the last good snapshot (stale-while-error).
import { fetchAllJobs } from './sources/index.js';

const TTL = Number(process.env.CACHE_TTL_MS || 30 * 60 * 1000);

let snapshot = null; // { jobs, meta, updatedAt }
let fetchedAt = 0;
let inFlight = null;

export async function getPool() {
  const isFresh = snapshot && Date.now() - fetchedAt < TTL;
  if (isFresh) return snapshot;
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
