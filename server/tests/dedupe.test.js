import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeJobs } from '../src/dedupe.js';

function job(overrides) {
  return {
    id: 'x', source: 'test', title: 'Software Engineer - Fresher', company: 'Groww',
    companyLogo: null, url: 'https://example.com/redirect', location: 'Bengaluru',
    locationCanonical: 'bengaluru', remote: false, postedAt: '2026-07-10T00:00:00.000Z',
    tags: [], category: null, jobType: null, descriptionText: '', compensationText: '',
    ...overrides,
  };
}

test('same job from three sources collapses to one', () => {
  const jobs = [
    job({ id: 'naukri-1', source: 'naukri', title: 'Software Engineer (Fresher)', url: 'https://naukri.com/redirect/1' }),
    job({ id: 'linkedin-1', source: 'linkedin_india', title: 'Software Engineer - Fresher', url: 'https://linkedin.com/redirect/2' }),
    job({
      id: 'careers-1', source: 'ats_boards', title: 'Software Engineer, Fresher', url: 'https://groww.in/careers/swe-fresher',
      descriptionText: 'Full job description with all the details a candidate needs.', companyLogo: 'https://groww.in/logo.png',
    }),
  ];

  const result = dedupeJobs(jobs);
  assert.equal(result.length, 1);
  assert.equal(result[0].duplicate_count, 3);
  // richest record (has description + logo + a direct, non-redirect apply link) should win
  assert.equal(result[0].id, 'careers-1');
});

test('different companies in the same week are not merged', () => {
  const jobs = [
    job({ id: 'a', company: 'Groww' }),
    job({ id: 'b', company: 'Postman' }),
  ];
  assert.equal(dedupeJobs(jobs).length, 2);
});

test('same company, very different titles are not merged', () => {
  const jobs = [
    job({ id: 'a', title: 'Software Engineer - Fresher' }),
    job({ id: 'b', title: 'HR Business Partner' }),
  ];
  assert.equal(dedupeJobs(jobs).length, 2);
});

test('same company, different week is not merged', () => {
  const jobs = [
    job({ id: 'a', postedAt: '2026-07-10T00:00:00.000Z' }),
    job({ id: 'b', postedAt: '2026-05-01T00:00:00.000Z' }),
  ];
  assert.equal(dedupeJobs(jobs).length, 2);
});
