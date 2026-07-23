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

// A job neither gate confidently excluded, but at least one gate couldn't
// confidently include either (LLM stage unavailable/failed/low-confidence).
// Per the spec's ambiguity policy this job is KEPT (status: 'unclear'), not
// dropped — this just leaves an audit trail for why it's not a clean "New".
export function logUnclear(job, fresherVerdict, roleVerdict) {
  appendLine(todayFile('unclear'), {
    ts: new Date().toISOString(),
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    fresher: { stage: fresherVerdict.stage, verdict: fresherVerdict.verdict, reason: fresherVerdict.reason },
    role: { stage: roleVerdict.stage, verdict: roleVerdict.verdict, reason: roleVerdict.reason },
  });
}

// A job both gates confidently liked, but the match/scam classifier
// (server/src/llm/matchScam.js) flagged as scam-shaped — this is what
// forces its status from 'new' down to 'unclear' in pipeline.js, so this
// audit line records why, separate from a gate-level unclear.
export function logScamFlagged(job, matchScam) {
  appendLine(todayFile('unclear'), {
    ts: new Date().toISOString(),
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    scamFlag: true,
    scamReason: matchScam.scam_reason,
  });
}

// A job that survived both gates but got dropped by the verification layer
// itself (server/src/verify/linkChecker.js) — a confirmed third-party/
// aggregator apply link, or the apply page's own text says the posting is
// closed/expired. Unlike logUnclear, this is a genuine drop (excluded), so
// it goes to the same excluded-*.jsonl audit file as the gate exclusions,
// tagged with gate: 'verification' so it's easy to tell apart from a role
// or experience gate rejection.
export function logExcludedByVerification(job, reason) {
  appendLine(todayFile('excluded'), {
    ts: new Date().toISOString(),
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    gate: 'verification',
    reason,
  });
}
