import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJobs } from '../src/sources/companyPages.js';
import { __clearRobotsCacheForTests } from '../src/util/robotsTxt.js';

test.beforeEach(() => __clearRobotsCacheForTests());

function jobPostingHtml(postings) {
  const body = Array.isArray(postings) ? postings : [postings];
  return `<html><head><script type="application/ld+json">${JSON.stringify(body.length === 1 ? body[0] : body)}</script></head><body></body></html>`;
}

function mockFetchSequence(handlers) {
  // handlers: url -> response. robots.txt requests always return "allow all".
  return async (url) => {
    if (String(url).endsWith('/robots.txt')) {
      return { ok: true, text: async () => 'User-agent: *\n' };
    }
    const handler = handlers[url];
    if (!handler) throw new Error(`unexpected fetch to ${url}`);
    return handler();
  };
}

test('no company_page_urls configured -> returns [] without any fetch', async () => {
  const cfg = { sources: { company_page_urls: [] }, rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 } };
  const jobs = await fetchJobs(cfg);
  assert.deepEqual(jobs, []);
});

test('extracts and normalizes a JobPosting into the RawJob shape', async (t) => {
  const url = 'https://acme.example.com/careers';
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence({
    [url]: async () => ({
      ok: true,
      text: async () => jobPostingHtml({
        '@type': 'JobPosting',
        title: 'Data Analyst Intern',
        description: '<p>Work with our analytics team on <b>dashboards</b>.</p>',
        datePosted: '2026-07-18',
        employmentType: 'INTERN',
        hiringOrganization: { name: 'Acme Corp', logo: 'https://acme.example.com/logo.png' },
        jobLocation: { '@type': 'Place', address: { addressLocality: 'Bengaluru', addressRegion: 'Karnataka' } },
        baseSalary: { currency: 'INR', value: { minValue: 15000, maxValue: 15000, unitText: 'MONTH' } },
        url: 'https://acme.example.com/careers/data-analyst-intern',
      }),
    }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const cfg = {
    sources: { company_page_urls: [{ url }] },
    rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 },
  };
  const jobs = await fetchJobs(cfg);
  assert.equal(jobs.length, 1);
  const job = jobs[0];
  assert.equal(job.title, 'Data Analyst Intern');
  assert.equal(job.company, 'Acme Corp');
  assert.equal(job.companyLogo, 'https://acme.example.com/logo.png');
  assert.equal(job.url, 'https://acme.example.com/careers/data-analyst-intern');
  assert.equal(job.location, 'Bengaluru, Karnataka');
  assert.equal(job.remote, false);
  assert.equal(job.compensationText, '₹15000/month');
  assert.match(job.descriptionText, /Work with our analytics team on dashboards/);
  assert.match(job.descriptionText, /Internship position/);
  assert.equal(job.source, 'company_pages');
});

test('a company-config "company" override wins over hiringOrganization.name', async (t) => {
  const url = 'https://acme.example.com/careers';
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence({
    [url]: async () => ({
      ok: true,
      text: async () => jobPostingHtml({ '@type': 'JobPosting', title: 'Data Engineer', hiringOrganization: { name: 'Wrong Name' } }),
    }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const cfg = {
    sources: { company_page_urls: [{ url, company: 'Acme Corp (override)' }] },
    rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 },
  };
  const jobs = await fetchJobs(cfg);
  assert.equal(jobs[0].company, 'Acme Corp (override)');
});

test('remote posting (TELECOMMUTE) is flagged remote: true', async (t) => {
  const url = 'https://acme.example.com/careers';
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence({
    [url]: async () => ({
      ok: true,
      text: async () => jobPostingHtml({ '@type': 'JobPosting', title: 'Data Analyst (Remote)', jobLocationType: 'TELECOMMUTE' }),
    }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const cfg = { sources: { company_page_urls: [{ url }] }, rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 } };
  const jobs = await fetchJobs(cfg);
  assert.equal(jobs[0].remote, true);
});

test('a non-INR baseSalary is not mislabeled as lakhs — compensationText left blank', async (t) => {
  const url = 'https://acme.example.com/careers';
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence({
    [url]: async () => ({
      ok: true,
      text: async () => jobPostingHtml({
        '@type': 'JobPosting',
        title: 'Data Analyst',
        baseSalary: { currency: 'USD', value: { minValue: 60000, maxValue: 80000, unitText: 'YEAR' } },
      }),
    }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const cfg = { sources: { company_page_urls: [{ url }] }, rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 } };
  const jobs = await fetchJobs(cfg);
  assert.equal(jobs[0].compensationText, '');
});

test('a page with no JobPosting JSON-LD contributes nothing, without erroring', async (t) => {
  const url = 'https://acme.example.com/careers';
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence({
    [url]: async () => ({ ok: true, text: async () => '<html><body>No structured data here.</body></html>' }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const cfg = { sources: { company_page_urls: [{ url }] }, rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 } };
  const jobs = await fetchJobs(cfg);
  assert.deepEqual(jobs, []);
});

test('a page disallowed by robots.txt is skipped entirely', async (t) => {
  const url = 'https://acme.example.com/careers';
  const originalFetch = global.fetch;
  let pageFetched = false;
  global.fetch = async (u) => {
    if (String(u).endsWith('/robots.txt')) return { ok: true, text: async () => 'User-agent: *\nDisallow: /careers\n' };
    pageFetched = true;
    return { ok: true, text: async () => jobPostingHtml({ '@type': 'JobPosting', title: 'Data Analyst' }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const cfg = { sources: { company_page_urls: [{ url }] }, rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 } };
  const jobs = await fetchJobs(cfg);
  assert.deepEqual(jobs, []);
  assert.equal(pageFetched, false, 'the disallowed page itself must never be fetched');
});

test('one failing company page does not affect another in the same run', async (t) => {
  const goodUrl = 'https://good.example.com/careers';
  const badUrl = 'https://bad.example.com/careers';
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence({
    [goodUrl]: async () => ({ ok: true, text: async () => jobPostingHtml({ '@type': 'JobPosting', title: 'Data Analyst Intern' }) }),
    [badUrl]: async () => { throw new Error('ECONNRESET'); },
  });
  t.after(() => { global.fetch = originalFetch; });

  const cfg = {
    sources: { company_page_urls: [{ url: goodUrl }, { url: badUrl }] },
    rate_limits: { max_concurrent_per_source: 3, retry_attempts: 1 },
  };
  const jobs = await fetchJobs(cfg);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Data Analyst Intern');
});
