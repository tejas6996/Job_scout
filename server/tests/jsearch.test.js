import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJobs } from '../src/sources/jsearch.js';
import { loadConfig } from '../src/config/loadConfig.js';

function jsearchJob(overrides) {
  return {
    job_id: 'abc123',
    job_title: 'Data Analyst Intern',
    employer_name: 'Acme Corp',
    employer_logo: null,
    job_city: 'Bengaluru',
    job_is_remote: false,
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_employment_type: 'INTERN',
    job_description: 'Great internship.',
    ...overrides,
  };
}

test('no JSEARCH_API_KEY -> returns [] without any fetch', async (t) => {
  const originalKey = process.env.JSEARCH_API_KEY;
  delete process.env.JSEARCH_API_KEY;
  t.after(() => { if (originalKey !== undefined) process.env.JSEARCH_API_KEY = originalKey; });

  const jobs = await fetchJobs(loadConfig());
  assert.deepEqual(jobs, []);
});

test('picks the official company link out of several apply_options, not just the first one', async (t) => {
  process.env.JSEARCH_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: { jobs: [jsearchJob({
        apply_options: [
          { publisher: 'LinkedIn', apply_link: 'https://www.linkedin.com/jobs/view/123' },
          { publisher: 'Naukri', apply_link: 'https://www.naukri.com/job-listings-data-analyst' },
          { publisher: 'Acme Careers', apply_link: 'https://careers.acme.com/jobs/data-analyst-intern' },
        ],
      })] },
    }),
  });
  t.after(() => { global.fetch = originalFetch; delete process.env.JSEARCH_API_KEY; });

  const jobs = await fetchJobs(loadConfig());
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, 'https://careers.acme.com/jobs/data-analyst-intern');
});

test('falls back to job_apply_link when apply_options is empty', async (t) => {
  process.env.JSEARCH_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: { jobs: [jsearchJob({ apply_options: [], job_apply_link: 'https://careers.acme.com/jobs/data-analyst-intern' })] },
    }),
  });
  t.after(() => { global.fetch = originalFetch; delete process.env.JSEARCH_API_KEY; });

  const jobs = await fetchJobs(loadConfig());
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, 'https://careers.acme.com/jobs/data-analyst-intern');
});

test('still surfaces the job even when every apply option is third-party (verification is the final say, not the fetcher)', async (t) => {
  process.env.JSEARCH_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: { jobs: [jsearchJob({
        apply_options: [
          { publisher: 'LinkedIn', apply_link: 'https://www.linkedin.com/jobs/view/123' },
          { publisher: 'Naukri', apply_link: 'https://www.naukri.com/job-listings-data-analyst' },
        ],
      })] },
    }),
  });
  t.after(() => { global.fetch = originalFetch; delete process.env.JSEARCH_API_KEY; });

  const jobs = await fetchJobs(loadConfig());
  assert.equal(jobs.length, 1, 'the fetcher should still surface it — the verification layer, not sourcing, enforces the official-link requirement');
  assert.equal(jobs[0].url, 'https://www.linkedin.com/jobs/view/123');
});
