// Mirrors "LLM Gemini" -> "Parse LLM Response".

function buildPrompt(job, profileText) {
  return (
    'You are screening a job for a candidate. Return STRICT JSON only, no markdown fences, matching exactly this shape:\n' +
    '{"match_score": 0-100 integer, "key_skills": [max 6 strings], "resume_bullets": [exactly 3 strings], "scam_flag": boolean, "scam_reason": "string, empty if false"}\n\n' +
    'Rules for resume_bullets: each must be grounded in the candidate actual profile below (rephrase real experience toward this job keywords, never invent experience), start with a strong verb, be at most 28 words, and are DRAFTS FOR HUMAN REVIEW - never auto-submitted anywhere.\n' +
    'Rules for scam_flag: true if the description shows registration/deposit fees, Telegram/WhatsApp-only contact, a generic personal email as the only contact, or pay-to-apply language; else false with scam_reason empty.\n\n' +
    `JOB TITLE: ${job.title}\n` +
    `COMPANY: ${job.company}\n` +
    `JOB DESCRIPTION (truncated): ${(job.description || '').slice(0, 4000)}\n\n` +
    `CANDIDATE PROFILE:\n${profileText}`
  );
}

function parseGeminiBody(body) {
  const fallback = {
    match_score: null,
    key_skills: [],
    resume_bullets: [],
    scam_flag: false,
    scam_reason: 'LLM parse error - review manually',
  };
  try {
    const raw = body.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      match_score: typeof parsed.match_score === 'number' ? parsed.match_score : null,
      key_skills: Array.isArray(parsed.key_skills) ? parsed.key_skills.slice(0, 6) : [],
      resume_bullets: Array.isArray(parsed.resume_bullets) ? parsed.resume_bullets.slice(0, 3) : [],
      scam_flag: !!parsed.scam_flag,
      scam_reason: parsed.scam_reason || '',
    };
  } catch {
    return fallback;
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
const RETRY_DELAYS_MS = [1000, 3000, 8000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini's free/shared-capacity models return transient 429/503s under load.
// Retry a few times with backoff before giving up — otherwise a normal load
// spike silently turns into a permanently blank match_score/key_skills/bullets.
async function callGemini(url, payload) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.ok) return body;
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === RETRY_DELAYS_MS.length) return body;
    } catch {
      if (attempt === RETRY_DELAYS_MS.length) return {};
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return {};
}

export async function scoreJobWithGemini(job, profileText, cfg) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.GEMINI_MODEL}:generateContent?key=${cfg.GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: buildPrompt(job, profileText) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };

  const body = await callGemini(url, payload);
  return { ...job, ...parseGeminiBody(body) };
}
