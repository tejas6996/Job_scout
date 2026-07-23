import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStageA } from '../src/filters/stageA.js';
import { loadConfig } from '../src/config/loadConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../tests/fixtures/jobs.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
const cfg = loadConfig();

test(`golden set: ${fixtures.length} fixtures produce their expected Stage A verdict`, () => {
  const mismatches = [];
  for (const fixture of fixtures) {
    const { expected, ...job } = fixture;
    const result = evaluateStageA(job, cfg);

    if (result.decision !== expected.decision) {
      mismatches.push(
        `${fixture.id} (${fixture.title}): expected decision "${expected.decision}", got "${result.decision}" (reason: ${result.reason})`,
      );
      continue;
    }
    if (expected.decision === 'include' && result.role_type !== expected.role_type) {
      mismatches.push(
        `${fixture.id} (${fixture.title}): expected role_type "${expected.role_type}", got "${result.role_type}"`,
      );
    }
  }
  assert.equal(mismatches.length, 0, `\n${mismatches.join('\n')}`);
});

test('golden set covers all four fresher role types plus exclude and undecided', () => {
  const decisions = new Set(fixtures.map((f) => f.expected.decision));
  const roleTypes = new Set(fixtures.filter((f) => f.expected.decision === 'include').map((f) => f.expected.role_type));
  assert.ok(decisions.has('include') && decisions.has('exclude') && decisions.has('undecided'));
  for (const rt of ['internship', 'apprenticeship', 'trainee', 'full_time_entry']) {
    assert.ok(roleTypes.has(rt), `golden set is missing a "${rt}" example`);
  }
});

test('hard-exclude: "2+ years" is excluded even though it looks in-range', () => {
  const job = { title: 'Business Analyst', descriptionText: '2+ years of experience required.' };
  const result = evaluateStageA(job, cfg);
  assert.equal(result.decision, 'exclude');
});

test('hard-exclude: senior/lead/manager-type titles are excluded regardless of body text', () => {
  for (const title of ['Senior Software Engineer', 'Engineering Lead', 'Team Manager', 'Principal Architect']) {
    const job = { title, descriptionText: 'Great opportunity to join our team.' };
    assert.equal(evaluateStageA(job, cfg).decision, 'exclude', `expected "${title}" to be excluded`);
  }
});

test('ambiguity policy: no years figure + senior title -> exclude', () => {
  const job = { title: 'Senior Product Manager', descriptionText: 'Own the product roadmap.' };
  assert.equal(evaluateStageA(job, cfg).decision, 'exclude');
});

test('ambiguity policy: no years figure + fresher wording -> include, low_confidence', () => {
  const job = { title: 'Trainee Analyst', descriptionText: 'Join our trainee program.' };
  const result = evaluateStageA(job, cfg);
  assert.equal(result.decision, 'include');
  assert.equal(result.low_confidence, true);
});

test('ambiguity policy: no years figure + no signal at all -> undecided (deferred to Stage B)', () => {
  const job = { title: 'Software Engineer', descriptionText: 'Build great products with us.' };
  assert.equal(evaluateStageA(job, cfg).decision, 'undecided');
});

test('hard-exclude: arabic-numeral/L-suffix internal level tiers are excluded', () => {
  for (const title of ['Data Analyst 3', 'Business Analyst 3', 'Data Engineer L3', 'Software Developer 4']) {
    const job = { title, descriptionText: 'Great opportunity to join our team.' };
    assert.equal(evaluateStageA(job, cfg).decision, 'exclude', `expected "${title}" to be excluded`);
  }
});

test('level-suffix regex does not false-positive on unrelated numbers', () => {
  const job = {
    title: 'Junior Data Analyst',
    descriptionText: 'Join a team of 5 analysts working on internal reporting. 0-2 years of experience required.',
  };
  assert.equal(evaluateStageA(job, cfg).decision, 'include');

  const supportJob = {
    title: 'Technical Support Analyst',
    descriptionText: 'Handles L2 support tickets for enterprise software clients. 1-2 years of experience needed.',
  };
  assert.equal(evaluateStageA(supportJob, cfg).decision, 'include');
});
