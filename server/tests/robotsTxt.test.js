import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedByRobots, __clearRobotsCacheForTests } from '../src/util/robotsTxt.js';

test.beforeEach(() => __clearRobotsCacheForTests());

test('a path matching a wildcard Disallow rule is rejected', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => 'User-agent: *\nDisallow: /careers\n' });
  t.after(() => { global.fetch = originalFetch; });

  const allowed = await isAllowedByRobots('https://example.com/careers/data-analyst');
  assert.equal(allowed, false);
});

test('a path not covered by any Disallow rule is allowed', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => 'User-agent: *\nDisallow: /admin\n' });
  t.after(() => { global.fetch = originalFetch; });

  const allowed = await isAllowedByRobots('https://example.com/careers/data-analyst');
  assert.equal(allowed, true);
});

test('no robots.txt reachable (404) -> allowed by default', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
  t.after(() => { global.fetch = originalFetch; });

  const allowed = await isAllowedByRobots('https://example.com/careers');
  assert.equal(allowed, true);
});

test('a network error fetching robots.txt -> allowed by default, never throws', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('ECONNRESET'); };
  t.after(() => { global.fetch = originalFetch; });

  const allowed = await isAllowedByRobots('https://example.com/careers');
  assert.equal(allowed, true);
});

test('a Disallow rule under a non-wildcard user-agent does not apply to us', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => 'User-agent: SomeOtherBot\nDisallow: /careers\n\nUser-agent: *\nDisallow: /admin\n',
  });
  t.after(() => { global.fetch = originalFetch; });

  const allowed = await isAllowedByRobots('https://example.com/careers/data-analyst');
  assert.equal(allowed, true);
});

test('results are cached per origin — a second call for the same origin does not re-fetch', async (t) => {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => { callCount += 1; return { ok: true, text: async () => 'User-agent: *\nDisallow: /admin\n' }; };
  t.after(() => { global.fetch = originalFetch; });

  await isAllowedByRobots('https://example.com/careers/1');
  await isAllowedByRobots('https://example.com/careers/2');
  assert.equal(callCount, 1);
});
