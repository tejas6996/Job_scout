import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../src/pipeline.js';
import { loadConfig } from '../src/config/loadConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../tests/fixtures/role_taxonomy.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

test('pipeline composes the role gate and experience gate with AND, not either alone', async () => {
  const cfg = loadConfig();
  // No GEMINI_API_KEY in the test process (nothing here imports dotenv/config),
  // so Tier 3 / Stage B deterministically fall back to reject rather than
  // calling the network — this run is fully offline and reproducible.
  assert.equal(process.env.GEMINI_API_KEY, undefined, 'sanity check: this test must not hit a live LLM');

  const rawJobs = fixtures.map(({ expectedRole, expectedExperience, ...job }) => ({
    ...job,
    postedAt: new Date().toISOString(), // pretend "posted today" so freshness never interferes
  }));

  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true });

  // Role gate alone: rt-01, rt-02, rt-03, rt-07 (rt-02 is a fit for the
  // family despite being senior — role gate doesn't know about seniority).
  assert.equal(funnel.afterRoleGate, 4);
  // Experience gate alone: everything except rt-02 (the only senior title).
  assert.equal(funnel.afterExperienceGate, 10);
  // AND of both: only jobs both gates independently accepted.
  assert.equal(funnel.kept, 3);

  const keptIds = jobs.map((j) => j.id).sort();
  assert.deepEqual(keptIds, ['rt-01', 'rt-03', 'rt-07']);

  // rt-02 (Senior Data Scientist) must never appear kept, even though the
  // role gate likes it — proves AND, not OR.
  assert.ok(!keptIds.includes('rt-02'));
});
