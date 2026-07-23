import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/pipeline.js';
import { loadConfig } from '../src/config/loadConfig.js';
import { isInScope } from '../src/location.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../tests/fixtures/jobs.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

test('config/india.yaml scopes the dashboard to Bengaluru only', () => {
  const cfg = loadConfig();
  assert.deepEqual(cfg.locations.scope, ['bengaluru']);
});

test('isInScope rejects every non-Bengaluru canonical location', () => {
  for (const key of ['mumbai', 'hyderabad', 'pune', 'chennai', 'delhi_ncr', 'remote_india', 'hybrid']) {
    assert.equal(isInScope(key), false, `expected "${key}" to be out of scope`);
  }
  assert.equal(isInScope('bengaluru'), true);
});

test('the fixture set includes non-Bengaluru postings (so this test is meaningful)', () => {
  const nonBengaluru = fixtures.filter((f) => !/bengaluru/i.test(f.location));
  assert.ok(nonBengaluru.length > 0, 'expected the golden set to include some non-Bengaluru locations');
});

test('runPipeline drops every non-Bengaluru posting, freshness/dedupe/fresher filters aside', async () => {
  const cfg = loadConfig();
  const rawJobs = fixtures.map(({ expected, ...job }) => ({
    ...job,
    postedAt: new Date().toISOString(), // pretend "posted today" so freshness never interferes
  }));

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.ok(jobs.length > 0, 'sanity check: at least some Bengaluru fixtures should survive');
  for (const job of jobs) {
    assert.equal(job.locationCanonical, 'bengaluru', `"${job.title}" leaked through with location "${job.locationCanonical}"`);
  }
});
