import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { loadConfig } from '../src/config/loadConfig.js';

// Covers the current real-world scope: config/roles.yaml's active_families
// ([data_analytics, data_engineering, data_science_ml, business_reporting])
// and config/india.yaml's active_role_types ([internship, apprenticeship])
// — internships/apprenticeships only, across the data-analyst/data-
// engineer/data-scientist/BI-business-analyst families (widened from just
// data_analytics/data_engineering after a live run showed genuine postings
// like "Data Scientist Intern" being dropped on family alone while the
// narrower two-family scope produced zero kept jobs for days). Uses the
// real loadConfig() on purpose (not an override) since this scope is the
// live default, not a hypothetical — twoGates.test.js clears it to test the
// original two-gate composition in isolation instead.
function job(overrides) {
  return {
    id: `scope-${overrides.title}`, source: 'test', company: 'Corp',
    companyLogo: null, url: `https://example.com/${overrides.title}`, location: 'Bengaluru', remote: false,
    postedAt: new Date().toISOString(), tags: [], category: null, jobType: 'Full-time',
    rawLevel: '', experienceText: '', compensationText: '',
    ...overrides,
  };
}

test('a Data Analyst internship (in scope on both dimensions) is kept', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({
    title: 'Data Analyst Intern',
    descriptionText: '3-month data analyst internship for students, no prior experience required.',
  })];

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].role.family, 'data_analytics');
  assert.equal(jobs[0].fresher.role_type, 'internship');
  assert.equal(jobs[0].status, 'new');
});

test('a Data Engineer apprenticeship (in scope on both dimensions) is kept', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({
    title: 'Data Engineer Apprenticeship',
    descriptionText: 'Apprenticeship program building ETL pipelines, 6 months of on-the-job training.',
  })];

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].role.family, 'data_engineering');
  assert.equal(jobs[0].fresher.role_type, 'apprenticeship');
  assert.equal(jobs[0].status, 'new');
});

test('a full-time-entry Data Analyst posting is dropped — role_type not in active_role_types scope', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({
    title: 'Data Analyst',
    descriptionText: 'Permanent role, 0-2 years of experience required. Work with SQL and dashboards.',
  })];

  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 0);
  assert.equal(funnel.excludedByExperience, 1);
});

test('a Data Scientist internship is kept — data_science_ml is in active_families scope', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({
    title: 'Data Scientist Internship',
    descriptionText: '3-month internship building ML models, no prior experience required.',
  })];

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].role.family, 'data_science_ml');
});

test('a Business Analyst internship is kept — business_reporting is in active_families scope', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({
    title: 'Business Analyst Internship',
    descriptionText: '3-month internship supporting stakeholder reporting, no prior experience required.',
  })];

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].role.family, 'business_reporting');
});

test('a Risk Analyst internship is still dropped — risk_quant is not in active_families scope', async () => {
  const cfg = loadConfig();
  const rawJobs = [job({
    title: 'Risk Analyst Internship',
    descriptionText: '3-month internship supporting credit risk modeling, no prior experience required.',
  })];

  const { jobs, funnel } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 0);
  assert.equal(funnel.excludedByRole, 1);
});

test('active_families/active_role_types have no effect when cleared (fallback to unrestricted)', async () => {
  const cfg = {
    ...loadConfig(),
    roleTaxonomy: { ...loadConfig().roleTaxonomy, active_families: [] },
    experience: { ...loadConfig().experience, active_role_types: [] },
  };
  const rawJobs = [job({
    title: 'Data Scientist',
    descriptionText: 'Permanent role, 0-2 years of experience required. Build ML models.',
  })];

  const { jobs } = await runPipeline(rawJobs, cfg, { silent: true, skipVerification: true });
  assert.equal(jobs.length, 1, 'with scopes cleared, a data_science_ml full_time_entry role should survive');
});
