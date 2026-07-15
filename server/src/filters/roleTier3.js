// Role gate, Tier 3 — LLM classifier for whatever Tier 1/2
// (roleTier12.js) couldn't cleanly place: novel phrasings, bundled titles
// ("Data/BI Analyst"), vague ones ("Analytics Trainee"). Same fallback
// philosophy as the experience gate's Stage B (stageB.js): strict JSON, and
// on any missing-key/parse/network failure this rejects rather than
// guesses — a missed data role is preferable to a non-data role leaking in.
import { withRetry } from '../util/fetchJson.js';

const VALID_FAMILIES = new Set([
  'data_analytics', 'business_reporting', 'risk_quant', 'data_science_ml',
  'data_engineering', 'bi_visualization_dev', 'data_ops_quality_governance',
  'data_product', 'adjacent_tech', 'none',
]);
const VALID_TIERS = new Set(['core', 'adjacent', 'none']);

function buildPrompt(job, taxonomy) {
  const familyList = Object.entries(taxonomy.families)
    .map(([key, f]) => `- ${key}: ${f.canonical} (tier: ${f.tier}${f.requires_data_signal ? ', requires a data signal in the JD' : ''})`)
    .join('\n');

  return (
    'You are screening a job posting\'s TITLE (and description, for context) against a fixed role taxonomy for a dashboard that only wants data/analytics/AI-ML/data-engineering roles for freshers. Return STRICT JSON only, no markdown fences, no prose, matching exactly this shape:\n' +
    '{"in_taxonomy": boolean, "family": "data_analytics | business_reporting | risk_quant | data_science_ml | data_engineering | bi_visualization_dev | data_ops_quality_governance | data_product | adjacent_tech | none", "tier": "core | adjacent | none", "has_data_signal": boolean, "confidence": number between 0 and 1, "reason": "short string"}\n\n' +
    `FAMILIES:\n${familyList}\n\n` +
    'Rules: pick at most one family — the single best fit, not a list. If the title is a lookalike that sounds data-ish but is really a different function (HR, sales, security, lab/chemical, investment banking, GIS), set in_taxonomy to false and family to "none". If you cannot confidently place the role, set in_taxonomy to false — a missed data role is preferable to a non-data role being included. has_data_signal should reflect whether the JOB DESCRIPTION (not just the title) shows real evidence of data/analytics/ML work (tools, datasets, pipelines, dashboards, models) — this matters most for adjacent-tier families.\n\n' +
    `JOB TITLE: ${job.title}\n` +
    `COMPANY: ${job.company}\n` +
    `JOB DESCRIPTION (truncated): ${(job.descriptionText || '').slice(0, 3000)}`
  );
}

const FALLBACK_REJECT = (reason) => ({
  in_taxonomy: false,
  family: 'none',
  tier: 'none',
  has_data_signal: false,
  confidence: 0,
  reason,
});

function parseResponse(body) {
  try {
    const raw = body.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.in_taxonomy !== 'boolean') throw new Error('missing in_taxonomy');
    return {
      in_taxonomy: parsed.in_taxonomy,
      family: VALID_FAMILIES.has(parsed.family) ? parsed.family : 'none',
      tier: VALID_TIERS.has(parsed.tier) ? parsed.tier : 'none',
      has_data_signal: Boolean(parsed.has_data_signal),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '',
    };
  } catch (err) {
    return FALLBACK_REJECT(`Role Tier 3 parse error (${err.message}) — excluded rather than guessed`);
  }
}

export async function classifyRoleWithLLM(job, cfg) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return FALLBACK_REJECT('Role Tier 3 disabled (no GEMINI_API_KEY configured) — excluded rather than guessed');
  }

  const model = cfg.llm?.model || 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: buildPrompt(job, cfg.roleTaxonomy) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  try {
    const body = await withRetry(() => callGemini(url, payload), cfg);
    return parseResponse(body);
  } catch (err) {
    return FALLBACK_REJECT(`Role Tier 3 request failed (${err.message}) — excluded rather than guessed`);
  }
}

async function callGemini(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  return res.json();
}
