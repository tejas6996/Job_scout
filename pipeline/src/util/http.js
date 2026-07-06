// fetch() wrappers with a hard timeout. "safeJson" mirrors n8n's `neverError: true`
// HTTP Request option — it never throws on a non-2xx status, it just returns
// whatever JSON body came back (or {} if the body isn't JSON) so callers can
// inspect status themselves.

export async function safeJson(url, { headers = {}, timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const text = await res.text();
    try {
      return { statusCode: res.status, body: text ? JSON.parse(text) : {} };
    } catch {
      return { statusCode: res.status, body: {} };
    }
  } catch (err) {
    return { statusCode: 0, body: {}, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Bounded-concurrency map, used so we never fire off hundreds of parallel
// requests (apply-link verification, Gemini scoring) at once.
export async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
