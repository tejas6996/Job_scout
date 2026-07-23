// Ported from the `soorya` branch's pipeline/src/llm.js — the richer Gemini
// output schema the original spec asked for (match_score/key_skills/
// resume_bullets/scam_flag/scam_reason), adapted to this codebase's style
// and only invoked on jobs that already survived both gates + dedupe
// (server/src/pipeline.js), not on every fetched job — a much smaller set,
// so this doesn't multiply the LLM call volume that stageB.js/roleTier3.js
// already spend on classification.
//
// No candidate profile page exists here (Notion is out of scope for this
// dashboard) — cfg.profileText (config/profile.md, loaded once by
// loadConfig.js) stands in for it.
import { withRetry } from '../util/fetchJson.js';

function buildPrompt(job, profileText) {
  return (
    'You are screening a job for a candidate. Return STRICT JSON only, no markdown fences, matching exactly this shape:\n' +
    '{"match_score": 0-100 integer, "key_skills": [max 6 strings], "resume_bullets": [exactly 3 strings], "scam_flag": boolean, "scam_reason": "string, empty if false"}\n\n' +
    'Rules for resume_bullets: each must be grounded in the candidate\'s REAL profile below (rephrase real experience toward this job\'s keywords, never invent experience), start with a strong past-tense verb, be at most 28 words, and are DRAFTS FOR HUMAN REVIEW — never auto-submitted anywhere.\n' +
    'Rules for scam_flag: true if the description shows registration/deposit fees, Telegram/WhatsApp-only contact, a generic personal email as the only contact, or pay-to-apply language; else false with scam_reason empty.\n\n' +
    `JOB TITLE: ${job.title}\n` +
    `COMPANY: ${job.company}\n` +
    `JOB DESCRIPTION (truncated): ${(job.descriptionText || '').slice(0, 4000)}\n\n` +
    `CANDIDATE PROFILE:\n${profileText || '(not provided)'}`
  );
}

const FALLBACK = (reason) => ({
  match_score: null,
  key_skills: [],
  resume_bullets: [],
  scam_flag: false,
  scam_reason: '',
  reason,
});

function parseResponse(body) {
  try {
    const raw = body.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      match_score: typeof parsed.match_score === 'number' ? parsed.match_score : null,
      key_skills: Array.isArray(parsed.key_skills) ? parsed.key_skills.slice(0, 6) : [],
      resume_bullets: Array.isArray(parsed.resume_bullets) ? parsed.resume_bullets.slice(0, 3) : [],
      scam_flag: Boolean(parsed.scam_flag),
      scam_reason: typeof parsed.scam_reason === 'string' ? parsed.scam_reason.slice(0, 300) : '',
      reason: '',
    };
  } catch (err) {
    return FALLBACK(`match/scam parse error (${err.message}) — review manually`);
  }
}

export async function classifyMatchAndScam(job, cfg) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return FALLBACK('match/scam disabled (no GEMINI_API_KEY configured)');
  }

  const model = cfg.llm?.model || 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: buildPrompt(job, cfg.profileText) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };

  try {
    const body = await withRetry(() => callGemini(url, payload), cfg);
    return parseResponse(body);
  } catch (err) {
    return FALLBACK(`match/scam request failed (${err.message}) — review manually`);
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
