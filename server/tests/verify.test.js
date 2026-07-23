import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyApplyLink } from '../src/verify/linkChecker.js';

function mockRes({ status = 200, url, text = '' } = {}) {
  return { status, url, text: async () => text };
}

test('no url -> unverified, no network call attempted', async () => {
  const result = await verifyApplyLink(undefined);
  assert.equal(result.verified, false);
  assert.equal(result.officialLink, null);
});

test('2xx response on a company domain -> verified true, officialLink true', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => mockRes({ status: 200, url });
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://careers.acme.com/job/1');
  assert.equal(result.verified, true);
  assert.equal(result.officialLink, true);
  assert.equal(result.expiredLink, false);
});

test('3xx redirect response -> verified true', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => mockRes({ status: 302, url });
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://careers.acme.com/job/2');
  assert.equal(result.verified, true);
});

test('4xx/5xx response -> verified false', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => mockRes({ status: 404, url });
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://careers.acme.com/job/3');
  assert.equal(result.verified, false);
});

test('network error is swallowed -> verified false, never throws', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('ECONNRESET'); };
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://careers.acme.com/job/4');
  assert.equal(result.verified, false);
  assert.equal(result.expiredLink, null, 'undetermined on network failure — we never got the page text');
  // officialLink is determined from the URL string alone (no network needed)
  // — a fetch failure doesn't erase that, it just means we couldn't confirm
  // reachability or read the page text.
  assert.equal(result.officialLink, true);
});

test('network error on an already-third-party domain still reports officialLink false', async (t) => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not be called'); };
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://www.naukri.com/job/1');
  assert.equal(result.officialLink, false);
  assert.equal(called, false, 'third-party check short-circuits before any fetch attempt');
});

test('a known third-party/aggregator domain is rejected without even fetching', async (t) => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not be called'); };
  t.after(() => { global.fetch = originalFetch; });

  for (const url of ['https://www.naukri.com/job-listings-data-analyst', 'https://apna.co/jobs/123', 'https://www.linkedin.com/jobs/view/123']) {
    const result = await verifyApplyLink(url);
    assert.equal(result.officialLink, false, `expected ${url} to be flagged non-official`);
    assert.equal(result.verified, false);
  }
  assert.equal(called, false, 'known third-party domains should short-circuit before any fetch');
});

test('a redirect that lands on a third-party domain is caught after following it', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => mockRes({ status: 200, url: 'https://www.naukri.com/final-landing-page' });
  t.after(() => { global.fetch = originalFetch; });

  // Adzuna-style tracking redirector — not third-party itself, but resolves to one.
  const result = await verifyApplyLink('https://www.adzuna.in/land/ad/123456');
  assert.equal(result.officialLink, false);
});

test('an official ATS-hosted board (Greenhouse/Lever/etc.) is treated as official, not third-party', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => mockRes({ status: 200, url });
  t.after(() => { global.fetch = originalFetch; });

  for (const url of ['https://boards.greenhouse.io/acme/jobs/1', 'https://jobs.lever.co/acme/1', 'https://jobs.ashbyhq.com/acme/1']) {
    const result = await verifyApplyLink(url);
    assert.equal(result.officialLink, true, `expected ${url} to be treated as official`);
  }
});

test('page text indicating the posting is closed -> expiredLink true', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => mockRes({
    status: 200,
    url,
    text: 'Thanks for your interest — this position has been filled and is no longer accepting applications.',
  });
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://careers.acme.com/job/5');
  assert.equal(result.verified, true);
  assert.equal(result.expiredLink, true);
});

test('normal page text -> expiredLink false, not null, on a successful fetch', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => mockRes({ status: 200, url, text: 'We are hiring a Data Analyst Intern in Bengaluru.' });
  t.after(() => { global.fetch = originalFetch; });

  const result = await verifyApplyLink('https://careers.acme.com/job/6');
  assert.equal(result.expiredLink, false);
});
