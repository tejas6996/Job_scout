import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { loadConfig } from '../src/config/loadConfig.js';

// End-to-end coverage for the stronger verification layer: an expired
// deadline drops a job before it even reaches the gates (no wasted
// LLM/network calls on a dead posting); a confirmed third-party apply
// domain or "this posting is closed" page text drops a job AFTER it
// survives both gates. Mocks global.fetch so this never makes a real
// network call — the mock stands in for verifyApplyLink's GET.
// deadline.js's extractApplyDeadline expects a DD-MM-YYYY or "20 Aug 2026"
// style date after "apply by" — not ISO (see server/src/deadline.js's
// parseLoose) — so tests build a date string in that shape.
function ddmmyyyy(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getFullYear()}`;
}

function job(overrides) {
  return {
    id: `verify-${overrides.title}`, source: 'test', company: 'Corp',
    companyLogo: null, url: 'https://careers.acme.com/job/1', location: 'Bengaluru', remote: false,
    postedAt: new Date().toISOString(), tags: [], category: null, jobType: 'Full-time',
    rawLevel: '', experienceText: '', compensationText: '',
    descriptionText: 'Data analyst internship for students, no prior experience required.',
    ...overrides,
  };
}

test('a posting with an already-passed apply deadline is dropped before reaching the gates', async () => {
  const cfg = loadConfig();
  const pastDeadline = ddmmyyyy(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
  const rawJobs = [job({
    title: 'Data Analyst Intern',
    descriptionText: `Data analyst internship. Apply by ${pastDeadline}. No prior experience required.`,
  })];

  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 0);
  assert.equal(funnel.afterDeadlineFilter, 0);
});

test('a posting with a future apply deadline is not affected by the deadline filter', async () => {
  const cfg = loadConfig();
  const futureDeadline = ddmmyyyy(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  const rawJobs = [job({
    title: 'Data Analyst Intern',
    descriptionText: `Data analyst internship. Apply by ${futureDeadline}. No prior experience required.`,
  })];

  const { funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(funnel.afterDeadlineFilter, 1);
});

test('a job whose apply link resolves to a third-party domain is dropped after passing both gates', async (t) => {
  const cfg = loadConfig();
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({ status: 200, url: 'https://www.naukri.com/final', text: async () => '' });
  t.after(() => { global.fetch = originalFetch; });

  const rawJobs = [job({ title: 'Data Analyst Intern', url: 'https://www.adzuna.in/land/ad/1' })];
  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true });
  assert.equal(jobs.length, 0);
  assert.equal(funnel.excludedByVerification, 1);
});

test('a job whose apply page text says the posting is closed is dropped after passing both gates', async (t) => {
  const cfg = loadConfig();
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({
    status: 200,
    url,
    text: async () => 'This position has been filled and is no longer accepting applications.',
  });
  t.after(() => { global.fetch = originalFetch; });

  const rawJobs = [job({ title: 'Data Analyst Intern' })];
  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true });
  assert.equal(jobs.length, 0);
  assert.equal(funnel.excludedByVerification, 1);
});

test('a job whose apply link is reachable, official, and not closed survives verification', async (t) => {
  const cfg = loadConfig();
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({ status: 200, url, text: async () => 'We are hiring! Apply now.' });
  t.after(() => { global.fetch = originalFetch; });

  const rawJobs = [job({ title: 'Data Analyst Intern' })];
  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true });
  assert.equal(jobs.length, 1);
  assert.equal(funnel.excludedByVerification, 0);
  assert.equal(jobs[0].verified, true);
});

test('a posting older than the 10-day freshness window is dropped', async () => {
  const cfg = loadConfig();
  assert.equal(cfg.freshness.max_age_days, 10, 'sanity check: freshness window should be tightened to 10 days');
  const rawJobs = [job({
    title: 'Data Analyst Intern',
    postedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  })];

  const { funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(funnel.afterFreshness, 0);
});

test('a "Sales Data Analyst" title is excluded even though it contains a matched family alias', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({ title: 'Sales Data Analyst' })];

  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 0);
  assert.equal(funnel.excludedByRole, 1);
});
