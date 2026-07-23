import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostnameOf, isThirdPartyHost, classifyHost, pickBestApplyLink } from '../src/util/applyDomains.js';

test('hostnameOf strips protocol, path and a leading www.', () => {
  assert.equal(hostnameOf('https://www.naukri.com/job/123'), 'naukri.com');
  assert.equal(hostnameOf('https://careers.acme.com/roles/5?ref=x'), 'careers.acme.com');
});

test('hostnameOf returns null for an unparseable URL, never throws', () => {
  assert.equal(hostnameOf('not a url'), null);
});

test('isThirdPartyHost matches known aggregators and their subdomains', () => {
  for (const host of ['naukri.com', 'www.naukri.com', 'apna.co', 'in.indeed.com', 'linkedin.com']) {
    assert.equal(isThirdPartyHost(host.replace(/^www\./, '')), true, `expected ${host} to be third-party`);
  }
  assert.equal(isThirdPartyHost('careers.acme.com'), false);
  assert.equal(isThirdPartyHost('boards.greenhouse.io'), false);
});

test('classifyHost: true for anything not on the blocklist, false for a match, null when hostname is unknown', () => {
  assert.equal(classifyHost('careers.acme.com'), true);
  assert.equal(classifyHost('naukri.com'), false);
  assert.equal(classifyHost(null), null);
});

test('pickBestApplyLink prefers a non-third-party candidate regardless of position', () => {
  const picked = pickBestApplyLink([
    'https://www.linkedin.com/jobs/view/123',
    'https://www.naukri.com/job-listings-data-analyst',
    'https://careers.acme.com/jobs/data-analyst-intern',
  ]);
  assert.equal(picked, 'https://careers.acme.com/jobs/data-analyst-intern');
});

test('pickBestApplyLink falls back to the first candidate if every option is third-party', () => {
  const picked = pickBestApplyLink([
    'https://www.linkedin.com/jobs/view/123',
    'https://www.naukri.com/job-listings-data-analyst',
  ]);
  assert.equal(picked, 'https://www.linkedin.com/jobs/view/123');
});

test('pickBestApplyLink ignores blank/undefined candidates', () => {
  const picked = pickBestApplyLink([undefined, '', 'https://careers.acme.com/jobs/1']);
  assert.equal(picked, 'https://careers.acme.com/jobs/1');
});

test('pickBestApplyLink returns null for an empty candidate list', () => {
  assert.equal(pickBestApplyLink([]), null);
});
