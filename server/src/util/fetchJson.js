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
