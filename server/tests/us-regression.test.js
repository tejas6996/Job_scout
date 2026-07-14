// Fails the build if a US-market assumption creeps back into actual source
// code. Docs (README.md, MIGRATION.md) are exempt on purpose — they narrate
// what was removed and are expected to name these terms once, as history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const SCAN_DIRS = ['client/src', 'server/src', 'config', 'tests'].map((d) => path.join(REPO_ROOT, d));
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.yaml', '.yml', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

const FORBIDDEN_PATTERNS = [
  { name: 'USD', pattern: /\bUSD\b/i },
  { name: 'H1B / H-1B', pattern: /\bH-?1B\b/i },
  { name: '401k', pattern: /\b401\(?k\)?\b/i },
  { name: 'ZIP code', pattern: /\bzip\s*code\b/i },
  { name: 'sponsorship', pattern: /\bsponsorship\b/i },
  { name: 'country=us', pattern: /country=us\b/i },
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

test('no US-market-specific tokens in source code', () => {
  const files = SCAN_DIRS.flatMap(walk);
  assert.ok(files.length > 20, 'sanity check: the scan should see well over 20 source files');

  const violations = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${name} found in ${path.relative(REPO_ROOT, file)}`);
      }
    }
  }

  assert.equal(violations.length, 0, `\n${violations.join('\n')}`);
});
