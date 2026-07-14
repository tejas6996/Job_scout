// fetch() wrapper with a hard timeout so a slow/hanging upstream can never
// stall the whole API. Node 18+ ships fetch + AbortController natively.

const DEFAULT_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 12000);

export async function fetchJson(url, { timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobScout/1.0 (+https://github.com/tejas6996/Job_scout)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Upstream responded ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential-backoff retry wrapper for a source's request function. Used so
// one upstream's transient 429/5xx never takes down the whole run — after
// the configured attempts are exhausted, the error propagates and the
// caller (server/src/sources/index.js) isolates it to that one source via
// Promise.allSettled.
export async function withRetry(fn, cfg) {
  const attempts = Math.max(1, cfg?.rate_limits?.retry_attempts || 1);
  const baseDelay = cfg?.rate_limits?.retry_base_delay_ms || 1000;

  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) await sleep(baseDelay * 2 ** attempt);
    }
  }
  throw lastErr;
}

// Bounded-concurrency map — caps how many requests a single source fires at
// once (config.rate_limits.max_concurrent_per_source), so a source with a
// long company/query list can't hammer an upstream all at once.
export async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
