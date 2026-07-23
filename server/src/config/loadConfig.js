// Loads config/india.yaml + config/roles.yaml once and caches them. This is
// the single source of truth for locations, thresholds, source toggles,
// rate limits (india.yaml) and the role taxonomy (roles.yaml) — nothing
// else in server/src should hardcode those values.
//
// roles.yaml is exposed as cfg.roleTaxonomy, deliberately separate from
// cfg.roles (india.yaml's existing include_keywords/exclude_title_keywords,
// used only by the experience gate) — the two are unrelated gates and
// should never be confused for one another.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../../config/india.yaml');
const ROLES_PATH = path.resolve(__dirname, '../../../config/roles.yaml');
// Candidate profile read once at startup — this dashboard has no Notion
// "My Profile" page (see server/src/llm/matchScam.js), so a local free-text
// file stands in for it. Missing file degrades to '' rather than throwing —
// match_score/resume_bullets just come back weaker, never crash the run.
const PROFILE_PATH = path.resolve(__dirname, '../../../config/profile.md');

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const rolesRaw = fs.readFileSync(ROLES_PATH, 'utf8');
  const profileText = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, 'utf8').trim() : '';
  cached = { ...yaml.load(raw), roleTaxonomy: yaml.load(rolesRaw), profileText };
  return cached;
}

// Test helper — lets tests/fixtures override config without touching the file on disk.
export function __setConfigForTests(cfg) {
  cached = cfg;
}
