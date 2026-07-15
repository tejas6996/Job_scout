// --dry-run mode — runs the whole pipeline (location -> freshness -> dedupe
// -> compensation/deadline enrichment -> two-stage fresher filter -> fit
// score) against tests/fixtures/jobs.json and prints the funnel. Touches no
// network, no provider API keys required. Run with `npm run dry-run` from
// server/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/loadConfig.js';
import { runPipeline } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../tests/fixtures/jobs.json');

async function main() {
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const rawJobs = fixtures.map(({ expected, ...job }) => job);
  const cfg = loadConfig();

  console.log(`[dry-run] loaded ${rawJobs.length} fixture jobs from ${path.relative(process.cwd(), FIXTURES_PATH)}`);
  console.log('[dry-run] no live network calls will be made (providers are not invoked)');

  const { jobs, funnel } = await runPipeline(rawJobs, cfg);

  console.log('\n[dry-run] funnel (role gate and experience gate shown independently — each');
  console.log('  is computed against the full deduped set, not off the other\'s leftovers):');
  console.table(funnel);

  const byRoleType = {};
  for (const job of jobs) {
    const key = job.fresher.role_type || 'unknown';
    byRoleType[key] = (byRoleType[key] || 0) + 1;
  }
  console.log('\n[dry-run] kept jobs by experience-gate role type:');
  console.table(byRoleType);

  const byFamily = {};
  for (const job of jobs) {
    const key = job.role.family || 'unknown';
    byFamily[key] = (byFamily[key] || 0) + 1;
  }
  console.log('\n[dry-run] kept jobs by role-taxonomy family:');
  console.table(byFamily);

  console.log(`\n[dry-run] top ${Math.min(5, jobs.length)} by fit score:`);
  const top = jobs.slice().sort((a, b) => b.fitScore - a.fitScore).slice(0, 5);
  for (const job of top) {
    console.log(`  [${job.fitScore}] ${job.title} @ ${job.company} (${job.locationCanonical}) — ${job.fresher.role_type}`);
  }

  console.log(`\n[dry-run] see server/logs/ for the excluded-jobs audit log and funnel record.`);
}

main().catch((err) => {
  console.error('[dry-run] failed:', err);
  process.exit(1);
});
