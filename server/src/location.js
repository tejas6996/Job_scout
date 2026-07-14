// Normalizes free-text location strings from job sources into one of the
// canonical India locations defined in config/india.yaml. Every alias table
// entry lives in that file — this module only does the matching.
import { loadConfig } from './config/loadConfig.js';

const REMOTE_HINT = /\bremote\b/i;
const HYBRID_HINT = /\bhybrid\b/i;
const INDIA_HINT = /\bindia\b/i;

let aliasIndex = null;

function buildAliasIndex() {
  const cfg = loadConfig();
  const index = [];
  for (const [canonical, aliases] of Object.entries(cfg.locations.canonical)) {
    for (const alias of aliases) {
      index.push({ canonical, pattern: new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i') });
    }
  }
  // Longer aliases first so "delhi ncr" matches before the bare "delhi" alias
  // inside the same canonical group would (order doesn't matter across
  // groups since each group is checked independently, but within noisy
  // strings like "Gurugram (Delhi NCR)" we want the most specific hit).
  index.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  return index;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the canonical key (e.g. "bengaluru", "remote_india") or null when
// the string doesn't match any known India location/alias.
export function canonicalizeLocation(raw) {
  if (!raw) return null;
  const text = String(raw).toLowerCase();
  aliasIndex ||= buildAliasIndex();

  const isRemote = REMOTE_HINT.test(text);
  const isHybrid = HYBRID_HINT.test(text);

  for (const { canonical, pattern } of aliasIndex) {
    if (canonical === 'remote_india' || canonical === 'hybrid') continue;
    if (pattern.test(text)) return canonical;
  }

  if (isRemote && (INDIA_HINT.test(text) || text.trim() === 'remote')) return 'remote_india';
  if (isHybrid) return 'hybrid';
  return null;
}

export function canonicalLabel(key) {
  const LABELS = {
    bengaluru: 'Bengaluru',
    gurugram: 'Gurugram',
    delhi_ncr: 'Delhi NCR',
    mumbai: 'Mumbai',
    hyderabad: 'Hyderabad',
    pune: 'Pune',
    chennai: 'Chennai',
    noida: 'Noida',
    kolkata: 'Kolkata',
    ahmedabad: 'Ahmedabad',
    coimbatore: 'Coimbatore',
    remote_india: 'Remote – India',
    hybrid: 'Hybrid',
  };
  return LABELS[key] || key;
}

export function isPriorityLocation(key) {
  const cfg = loadConfig();
  return (cfg.locations.priority || []).includes(key);
}

export function allCanonicalLocations() {
  const cfg = loadConfig();
  return Object.keys(cfg.locations.canonical);
}

// Test/internal helper to reset the memoized alias index after swapping config.
export function __resetLocationIndexForTests() {
  aliasIndex = null;
}
