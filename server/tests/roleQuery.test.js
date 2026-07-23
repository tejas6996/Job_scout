import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleQuery } from '../src/sources/roleQuery.js';
import { loadConfig } from '../src/config/loadConfig.js';

const cfg = loadConfig();
// The real config currently scopes both families and role types down
// (active_families: [data_analytics, data_engineering, data_science_ml,
// business_reporting], active_role_types: [internship, apprenticeship]) —
// an unscoped cfg lets these tests also cover the fallback-to-full-taxonomy
// path when that scope is emptied out.
const unscopedCfg = {
  ...cfg,
  roleTaxonomy: { ...cfg.roleTaxonomy, active_families: [] },
  experience: { ...cfg.experience, active_role_types: [] },
};

test('buildRoleQuery respects config/roles.yaml\'s active_families scope when set', () => {
  const query = buildRoleQuery(cfg);
  for (const term of ['Data Analyst', 'Data Engineer', 'Data Scientist', 'Business Analyst']) {
    assert.ok(query.includes(term), `expected "${term}" in the query, got: ${query}`);
  }
  // A family outside the active scope must not leak into the fetch query —
  // there's no point spending fetch budget on roles the gates will drop.
  assert.ok(!query.includes('Risk Analyst'), `did not expect "Risk Analyst" (risk_quant, not in active_families) in a scoped query, got: ${query}`);
  assert.ok(!query.includes('BI Developer'), `did not expect "BI Developer" (bi_visualization_dev, not in active_families) in a scoped query, got: ${query}`);
});

test('buildRoleQuery falls back to every core family when active_families is empty/unset', () => {
  const query = buildRoleQuery(unscopedCfg);
  for (const term of ['Data Analyst', 'Business Analyst', 'Data Scientist', 'Data Engineer', 'Risk Analyst']) {
    assert.ok(query.includes(term), `expected "${term}" in the unscoped query, got: ${query}`);
  }
  // The generic SWE terms that used to dominate the truncated india.yaml
  // list should not be the ONLY thing in the query — this is a query built
  // from the actual data/analytics/ML taxonomy, not a substring of it.
  assert.ok(!/^software engineer OR swe OR developer$/i.test(query));
});

test('buildRoleQuery omits the fresher qualifier by default (Adzuna what_or use)', () => {
  const query = buildRoleQuery(cfg);
  assert.ok(!/\bfresher\b/i.test(query));
});

test('buildRoleQuery\'s fresher qualifier reflects active_role_types when set (JSearch natural-language query use)', () => {
  const query = buildRoleQuery(cfg, { includeFresherQualifier: true });
  // Real config scopes to internship/apprenticeship only — the qualifier
  // should target those terms, not the full generic fresher/trainee/junior
  // list (that's the whole point of narrowing the fetch to match the gates).
  assert.match(query, /\bintern(ship)?\b/i);
  assert.match(query, /\bapprentice(ship)?\b/i);
});

test('buildRoleQuery\'s fresher qualifier falls back to the full list when active_role_types is empty/unset', () => {
  const query = buildRoleQuery(unscopedCfg, { includeFresherQualifier: true });
  assert.match(query, /\bfresher\b/i);
  assert.match(query, /\btrainee\b/i);
});

test('buildRoleQuery caps the number of family terms so the query string stays bounded', () => {
  const query = buildRoleQuery(unscopedCfg);
  const termCount = query.split(' OR ').length;
  assert.ok(termCount <= 8, `expected at most 8 OR-terms, got ${termCount}: ${query}`);
});
