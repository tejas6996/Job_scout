import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMatchAndScam } from '../src/llm/matchScam.js';

const cfg = { llm: { model: 'gemini-2.5-flash-lite' }, profileText: 'Skilled in SQL and Python.', rate_limits: { retry_attempts: 1 } };

function geminiBody(json) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] };
}

test('returns a safe fallback when GEMINI_API_KEY is unset — no network call is made', async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('should not be called'); };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
  });

  const result = await classifyMatchAndScam({ title: 'Data Analyst', company: 'Corp', descriptionText: 'x' }, cfg);
  assert.equal(result.match_score, null);
  assert.deepEqual(result.key_skills, []);
  assert.deepEqual(result.resume_bullets, []);
  assert.equal(result.scam_flag, false);
});

test('parses a well-formed Gemini response into the expected schema', async (t) => {
  process.env.GEMINI_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => geminiBody({
      match_score: 82,
      key_skills: ['SQL', 'Python', 'Excel'],
      resume_bullets: ['Built a dashboard.', 'Automated a report.', 'Analyzed sales data.'],
      scam_flag: false,
      scam_reason: '',
    }),
  });
  t.after(() => { global.fetch = originalFetch; delete process.env.GEMINI_API_KEY; });

  const result = await classifyMatchAndScam({ title: 'Data Analyst', company: 'Corp', descriptionText: 'x' }, cfg);
  assert.equal(result.match_score, 82);
  assert.deepEqual(result.key_skills, ['SQL', 'Python', 'Excel']);
  assert.equal(result.resume_bullets.length, 3);
  assert.equal(result.scam_flag, false);
});

test('flags scam_flag through and truncates key_skills/resume_bullets to their caps', async (t) => {
  process.env.GEMINI_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => geminiBody({
      match_score: 40,
      key_skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      resume_bullets: ['one', 'two', 'three', 'four'],
      scam_flag: true,
      scam_reason: 'Registration fee requested via WhatsApp.',
    }),
  });
  t.after(() => { global.fetch = originalFetch; delete process.env.GEMINI_API_KEY; });

  const result = await classifyMatchAndScam({ title: 'Data Analyst', company: 'Corp', descriptionText: 'x' }, cfg);
  assert.equal(result.scam_flag, true);
  assert.match(result.scam_reason, /Registration fee/);
  assert.equal(result.key_skills.length, 6);
  assert.equal(result.resume_bullets.length, 3);
});

test('a malformed response falls back safely rather than throwing', async (t) => {
  process.env.GEMINI_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [] }) });
  t.after(() => { global.fetch = originalFetch; delete process.env.GEMINI_API_KEY; });

  const result = await classifyMatchAndScam({ title: 'Data Analyst', company: 'Corp', descriptionText: 'x' }, cfg);
  assert.equal(result.match_score, null);
  assert.equal(result.scam_flag, false);
  assert.match(result.reason, /parse error/);
});
