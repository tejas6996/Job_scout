// Caches LLM classification verdicts (Stage B, Role Tier 3) by job id.
// Without this, every 15-minute background refresh (server/src/pool.js)
// re-runs the full pipeline from scratch, which means re-submitting the
// *same* still-undecided jobs to Gemini every single cycle. Gemini's free
// tier is capped at 20 requests/minute — with two independent gates now
// both LLM-backed, that quota was being exhausted almost immediately on
// every refresh, so most jobs fell back to "reject" not because they
// failed classification but because the retry/backoff (seconds) is far
// shorter than Gemini's actual cooldown (its 429 body reports ~49s).
//
// Two TTLs, not one: a real verdict (the LLM actually answered) is cached
// long — it's not going to change. A transient failure (rate-limited, no
// API key, network error, parse error) is cached briefly — caching a
// bad-luck 429 for a full hour would mean a genuinely-eligible job stays
// wrongly excluded until the cache expires, which defeats the point of
// retrying at all. getTtlMs(value) lets the caller (filters/index.js)
// decide which bucket a result falls into by inspecting its `reason`
// string, without this module needing to know anything about Stage
// B/Tier 3's internals.
const NORMAL_TTL_MS = 60 * 60 * 1000; // 1 hour — a handful of refresh cycles
const TRANSIENT_TTL_MS = 2 * 60 * 1000; // 2 minutes — retry soon, not stuck for an hour

const cache = new Map(); // key -> { value, at, ttlMs }

export async function withLLMCache(key, fn, getTtlMs) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttlMs) return cached.value;

  const value = await fn();
  const ttlMs = typeof getTtlMs === 'function' ? getTtlMs(value) : NORMAL_TTL_MS;
  cache.set(key, { value, at: Date.now(), ttlMs });
  return value;
}

const TRANSIENT_REASON = /no GEMINI_API_KEY|parse error|request failed/i;

// Shared TTL-picker for both gates' fallback conventions ("Stage B
// disabled...", "...parse error...", "...request failed..." — see
// stageB.js / roleTier3.js's FALLBACK_EXCLUDE / FALLBACK_REJECT reasons).
export function ttlForVerdict(value) {
  return TRANSIENT_REASON.test(value?.reason || '') ? TRANSIENT_TTL_MS : NORMAL_TTL_MS;
}

// Test/internal helper.
export function __clearLLMCacheForTests() {
  cache.clear();
}
