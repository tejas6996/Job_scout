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
  // active_families/active_role_types (config/roles.yaml, config/india.yaml)
  // are a separate, later-added narrowing on top of this — see
  // roleTypeScope.test.js. This test is about the original two-gate AND
  // composition itself, so those scopes are cleared here to isolate it.
  const cfg = {
    ...loadConfig(),
    roleTaxonomy: { ...loadConfig().roleTaxonomy, active_families: [] },
    experience: { ...loadConfig().experience, active_role_types: [] },
  };
  // No GEMINI_API_KEY in the test process (nothing here imports dotenv/config),
  // so Tier 3 / Stage B deterministically fall back to reject rather than
  // calling the network — this run is fully offline and reproducible.
  assert.equal(process.env.GEMINI_API_KEY, undefined, 'sanity check: this test must not hit a live LLM');

  const rawJobs = fixtures.map(({ expectedRole, expectedExperience, ...job }) => ({
    ...job,
    postedAt: new Date().toISOString(), // pretend "posted today" so freshness never interferes
  }));

  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });

  // Role gate: rt-01, rt-02, rt-03, rt-07 confidently include; rt-08, rt-09
  // are bundled/novel titles that Tier 1/2 defers to Tier 3 — with no
  // GEMINI_API_KEY, Tier 3 can't confidently decide either way, so per the
  // ambiguity policy they come back 'unclear' (still counted here — a job
  // only drops out of afterRoleGate on a confident 'exclude').
  assert.equal(funnel.afterRoleGate, 6);
  // Experience gate alone: everything except rt-02 (the only senior title).
  assert.equal(funnel.afterExperienceGate, 10);
  // AND of both, keeping 'unclear' rather than dropping it: rt-01/03/07
  // (both gates confidently include) plus rt-08/09 (role gate unclear,
  // experience gate include — kept, flagged for review, not dropped).
  assert.equal(funnel.kept, 5);
  assert.equal(funnel.unclear, 2);

  const keptIds = jobs.map((j) => j.id).sort();
  assert.deepEqual(keptIds, ['rt-01', 'rt-03', 'rt-07', 'rt-08', 'rt-09']);

  const byId = Object.fromEntries(jobs.map((j) => [j.id, j]));
  assert.equal(byId['rt-01'].status, 'new');
  assert.equal(byId['rt-03'].status, 'new');
  assert.equal(byId['rt-07'].status, 'new');
  assert.equal(byId['rt-08'].status, 'unclear');
  assert.equal(byId['rt-09'].status, 'unclear');

  // rt-02 (Senior Data Scientist) must never appear kept, even though the
  // role gate likes it — proves AND, not OR.
  assert.ok(!keptIds.includes('rt-02'));
});
