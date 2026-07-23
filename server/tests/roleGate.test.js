import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRoleTier12, normalizeTitle } from '../src/filters/roleTier12.js';
import { evaluateStageA } from '../src/filters/stageA.js';
import { loadConfig } from '../src/config/loadConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../tests/fixtures/role_taxonomy.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
const cfg = loadConfig();

test(`role-taxonomy golden set: ${fixtures.length} fixtures produce their expected Tier 1/2 verdict`, () => {
  const mismatches = [];
  for (const fixture of fixtures) {
    const { expectedRole, expectedExperience, ...job } = fixture;
    const result = evaluateRoleTier12(job, cfg);

    if (result.decision !== expectedRole.decision) {
      mismatches.push(`${fixture.id} (${fixture.title}): expected role decision "${expectedRole.decision}", got "${result.decision}" (reason: ${result.reason})`);
      continue;
    }
    if (expectedRole.decision !== 'undecided') {
      if ('family' in expectedRole && result.family !== expectedRole.family) {
        mismatches.push(`${fixture.id} (${fixture.title}): expected family "${expectedRole.family}", got "${result.family}"`);
      }
      if ('tier' in expectedRole && result.tier !== expectedRole.tier) {
        mismatches.push(`${fixture.id} (${fixture.title}): expected tier "${expectedRole.tier}", got "${result.tier}"`);
      }
      if ('has_data_signal' in expectedRole && result.has_data_signal !== expectedRole.has_data_signal) {
        mismatches.push(`${fixture.id} (${fixture.title}): expected has_data_signal ${expectedRole.has_data_signal}, got ${result.has_data_signal}`);
      }
    }
  }
  assert.equal(mismatches.length, 0, `\n${mismatches.join('\n')}`);
});

test('exclusion precedence: a title matching both a family and exclude_titles is rejected via exclusion', () => {
  const job = { title: 'Business Analyst / Sales Analyst', descriptionText: 'Split role.' };
  const result = evaluateRoleTier12(job, cfg);
  assert.equal(result.decision, 'exclude');
  assert.match(result.reason, /excluded lookalike/);
  assert.match(result.reason, /sales analyst/);
});

test('bundled titles ("&" or "/") skip straight past Tier 1/2 to the Tier 3 hand-off, never guessing which half applies', () => {
  const withAmp = evaluateRoleTier12({ title: 'Data & BI Analyst - Trainee', descriptionText: 'x' }, cfg);
  const withSlash = evaluateRoleTier12({ title: 'Data/BI Analyst', descriptionText: 'x' }, cfg);
  assert.equal(withAmp.decision, 'undecided');
  assert.equal(withSlash.decision, 'undecided');
});

test('a title with zero data/analytics/ML/BI-ish token is default-denied without reaching Tier 3', () => {
  const result = evaluateRoleTier12({ title: 'Junior HR Executive', descriptionText: 'Onboarding and employee relations.' }, cfg);
  assert.equal(result.decision, 'exclude');
  assert.match(result.reason, /default deny/);
});

test('normalizeTitle strips location suffixes, roman numerals, recruiter junk and company tags', () => {
  assert.equal(normalizeTitle('Data Analyst (Bangalore)').normalized, 'data analyst');
  assert.equal(normalizeTitle('Data Analyst - Bengaluru').normalized, 'data analyst');
  assert.equal(normalizeTitle('Software Engineer II').normalized, 'software engineer');
  assert.equal(normalizeTitle('Data Analyst @ Groww').normalized, 'data analyst');
  assert.equal(normalizeTitle('Data Analyst (Immediate Joiner)').normalized, 'data analyst');
});

test('normalizeTitle strips arabic-numeral/L-suffix internal level tiers, keeping the role word', () => {
  assert.equal(normalizeTitle('Data Analyst 3').normalized, 'data analyst');
  assert.equal(normalizeTitle('Data Engineer L3').normalized, 'data engineer');
});

test('the two gates report independently: role-eligible but experience-ineligible, and vice versa', () => {
  const senior = fixtures.find((f) => f.id === 'rt-02'); // "Senior Data Scientist"
  const seniorRole = evaluateRoleTier12(senior, cfg);
  const seniorExperience = evaluateStageA(senior, cfg);
  assert.equal(seniorRole.decision, 'include', 'role gate should recognize this as a data science role');
  assert.equal(seniorExperience.decision, 'exclude', 'experience gate should reject it for seniority, independent of role fit');

  const hrExec = fixtures.find((f) => f.id === 'rt-11'); // "Junior HR Executive"
  const hrRole = evaluateRoleTier12(hrExec, cfg);
  const hrExperience = evaluateStageA(hrExec, cfg);
  assert.equal(hrRole.decision, 'exclude', 'role gate should reject it — not a data role');
  assert.equal(hrExperience.decision, 'include', 'experience gate should accept it — 0-1 yrs, junior title, independent of role fit');
});
