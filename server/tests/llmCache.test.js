import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLLMCache, ttlForVerdict, __clearLLMCacheForTests } from '../src/llmCache.js';

test('caches a value and skips re-calling fn on a hit', async () => {
  __clearLLMCacheForTests();
  let calls = 0;
  const fn = () => { calls += 1; return Promise.resolve({ reason: 'a real verdict' }); };

  await withLLMCache('k1', fn, ttlForVerdict);
  await withLLMCache('k1', fn, ttlForVerdict);
  assert.equal(calls, 1, 'second call should hit the cache, not re-invoke fn');
});

test('ttlForVerdict: transient failures (rate limit / no key / parse error) get the short TTL', () => {
  __clearLLMCacheForTests();
  const transientReasons = [
    'Stage B disabled (no GEMINI_API_KEY configured) — excluded rather than guessed',
    'Stage B request failed (Gemini responded 429) — excluded rather than guessed',
    'Role Tier 3 parse error (Unexpected token) — excluded rather than guessed',
  ];
  for (const reason of transientReasons) {
    assert.ok(ttlForVerdict({ reason }) < 60 * 60 * 1000, `expected a short TTL for: "${reason}"`);
  }
});

test('ttlForVerdict: a real verdict gets the long TTL', () => {
  const real = ttlForVerdict({ reason: 'requires 5+ years experience' });
  assert.equal(real, 60 * 60 * 1000);
});

test('different keys do not collide', async () => {
  __clearLLMCacheForTests();
  const a = await withLLMCache('job-a', () => Promise.resolve({ reason: 'x', v: 1 }), ttlForVerdict);
  const b = await withLLMCache('job-b', () => Promise.resolve({ reason: 'x', v: 2 }), ttlForVerdict);
  assert.equal(a.v, 1);
  assert.equal(b.v, 2);
});
