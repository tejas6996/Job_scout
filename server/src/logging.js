// Structured per-run funnel logging, plus a persisted, append-only record of
// every excluded job and why — so false negatives in the fresher filter can
// be audited later instead of silently vanishing. Never crashes the run: a
// disk-write failure here is logged and swallowed, not thrown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../logs');

function todayFile(prefix) {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${prefix}-${date}.jsonl`);
}

function appendLine(filePath, obj) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`, 'utf8');
  } catch (err) {
    console.error('[job-scout] failed to write log line:', err.message);
  }
}

// funnel: { fetched, afterDedupe, afterStageA, afterStageB, kept, bySource: {name: count} }
export function logFunnel(funnel) {
  const entry = { type: 'funnel', ts: new Date().toISOString(), ...funnel };
  console.log('[job-scout] run funnel', JSON.stringify(entry));
  appendLine(todayFile('funnel'), entry);
}

// job: the raw/normalized job; verdict: { reason, stage, confidence, ... };
// gate: 'experience' | 'role' — which independent gate produced this
// verdict. A job failing both gates gets two separate log lines (one per
// gate), never one merged line — the two decisions are logged as
// independently as they're made (see pipeline.js).
export function logExcluded(job, verdict, gate) {
  appendLine(todayFile('excluded'), {
    ts: new Date().toISOString(),
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    gate,
    stage: verdict.stage,
    reason: verdict.reason,
    confidence: verdict.confidence,
  });
}
