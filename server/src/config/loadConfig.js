// Loads config/india.yaml once and caches it. This is the single source of
// truth for locations, role keywords, thresholds, source toggles and rate
// limits — nothing else in server/src should hardcode those values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../../config/india.yaml');

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  cached = yaml.load(raw);
  return cached;
}

// Test helper — lets tests/fixtures override config without touching the file on disk.
export function __setConfigForTests(cfg) {
  cached = cfg;
}
