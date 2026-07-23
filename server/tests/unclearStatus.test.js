import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { loadConfig } from '../src/config/loadConfig.js';

// Complements twoGates.test.js's rt-08/rt-09 cases (role gate unclear). This
// covers the experience-gate side: a title with no years figure and no
// fresher/senior wording defers to Stage B (stageA.js's 'undecided' path);
// with no GEMINI_API_KEY in the test process, Stage B can't confidently
// decide either way, so per the spec's "never silently drop" ambiguity
// policy the job must be KEPT with status 'unclear', not excluded.
test('a title Stage A can\'t resolve, with Stage B unavailable, is kept as status "unclear" — never silently dropped', async () => {
  const cfg = loadConfig();
  assert.equal(process.env.GEMINI_API_KEY, undefined, 'sanity check: this test must not hit a live LLM');

  const rawJobs = [{
    id: 'unclear-1', source: 'test', title: 'Data Analyst', company: 'Corp',
    companyLogo: null, url: 'https://example.com/unclear-1', location: 'Bengaluru', remote: false,
    postedAt: new Date().toISOString(), tags: [], category: null, jobType: 'Full-time',
    rawLevel: '', experienceText: '',
    descriptionText: 'Work with our analytics team on internal reporting and dashboards.',
    compensationText: '',
  }];

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });

  assert.equal(jobs.length, 1, 'the job must be kept, not dropped');
  const job = jobs[0];
  assert.equal(job.fresher.stage, 'B');
  assert.equal(job.fresher.verdict, 'unclear');
  assert.equal(job.role.verdict, 'include');
  assert.equal(job.status, 'unclear');
});
