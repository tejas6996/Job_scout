// Stage B — LLM classifier, only invoked for jobs Stage A returned as
// 'undecided'. Must return strict JSON, no prose. Keyed by GEMINI_API_KEY
// (server/.env) — when unset, or on any parse/network failure, we fall back
// to excluding the job rather than guessing, per the "stricter filtering
// over false positives" instruction.
import { withRetry } from '../util/fetchJson.js';

const SCHEMA_INSTRUCTIONS = `You are screening an Indian job posting to decide if it's suitable for a "fresher" (a candidate with 0-2 years of experience: full-time entry-level roles, internships, apprenticeships, or graduate/management trainee programs).

Return STRICT JSON only, no markdown fences, no prose, matching exactly this shape:
{"is_fresher_eligible": boolean, "min_years": number, "max_years": number, "role_type": "internship" | "apprenticeship" | "trainee" | "full_time_entry", "confidence": number between 0 and 1, "reason": "short string"}

If the posting clearly requires more than 2 years of experience, or is a senior/lead/manager-type role, set is_fresher_eligible to false. If you are not confident either way, set is_fresher_eligible to false and explain why in "reason" — a missed fresher-eligible job is preferable to a wrongly-included senior role.`;

function buildPrompt(job) {
  return (
    `${SCHEMA_INSTRUCTIONS}\n\n` +
    `JOB TITLE: ${job.title}\n` +
    `COMPANY: ${job.company}\n` +
    `JOB DESCRIPTION (truncated): ${(job.descriptionText || '').slice(0, 4000)}`
  );
}

const FALLBACK_EXCLUDE = (reason) => ({
  is_fresher_eligible: false,
  min_years: null,
  max_years: null,
  role_type: null,
  confidence: 0,
  reason,
});

function parseResponse(body) {
  try {
    const raw = body.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const validRoleTypes = new Set(['internship', 'apprenticeship', 'trainee', 'full_time_entry']);
    if (typeof parsed.is_fresher_eligible !== 'boolean') throw new Error('missing is_fresher_eligible');
    return {
      is_fresher_eligible: parsed.is_fresher_eligible,
      min_years: typeof parsed.min_years === 'number' ? parsed.min_years : null,
      max_years: typeof parsed.max_years === 'number' ? parsed.max_years : null,
      role_type: validRoleTypes.has(parsed.role_type) ? parsed.role_type : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '',
    };
  } catch (err) {
    return FALLBACK_EXCLUDE(`Stage B parse error (${err.message}) — excluded rather than guessed`);
  }
}

export async function classifyWithLLM(job, cfg) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return FALLBACK_EXCLUDE('Stage B disabled (no GEMINI_API_KEY configured) — excluded rather than guessed');
  }

  const model = cfg.llm?.model || 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: buildPrompt(job) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  try {
    const body = await withRetry(() => callGemini(url, payload), cfg);
    return parseResponse(body);
  } catch (err) {
    return FALLBACK_EXCLUDE(`Stage B request failed (${err.message}) — excluded rather than guessed`);
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
