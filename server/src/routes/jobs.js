import express from 'express';
import { getPool } from '../pool.js';

const router = express.Router();

const VALID_SOURCES = new Set(['jobicy', 'remotive', 'arbeitnow']);
const VALID_SORTS = new Set(['recent', 'relevant']);
const VALID_LEVELS = new Set(['all', 'internship', 'entry', 'junior', 'open']);

const CONFIDENCE_SCORE = { high: 3, medium: 2, low: 1 };

// GET /api/jobs — filtered, sorted, paginated fresher-friendly jobs.
router.get('/jobs', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
  } catch (err) {
    return res.status(502).json({
      error: 'Could not reach any job source right now. Please try again shortly.',
      jobs: [],
      total: 0,
      page: 1,
      pages: 1,
    });
  }

  // ---- Validate + clamp all user input (never trust the query string) ----
  const q = str(req.query.q, 80).toLowerCase();
  const source = VALID_SOURCES.has(req.query.source) ? req.query.source : '';
  const remote = req.query.remote === 'true' ? true : req.query.remote === 'false' ? false : null;
  const level = VALID_LEVELS.has(req.query.level) ? req.query.level : 'all';
  const lang = req.query.lang === 'all' ? 'all' : 'en'; // default: English only
  const sort = VALID_SORTS.has(req.query.sort) ? req.query.sort : 'relevant';
  const page = clampInt(req.query.page, 1, 1, 1000);
  const limit = clampInt(req.query.limit, 24, 1, 60);

  let jobs = pool.jobs.filter((j) => j.fresher.eligible);

  if (q) {
    jobs = jobs.filter((j) =>
      `${j.title} ${j.company} ${j.location} ${(j.tags || []).join(' ')}`.toLowerCase().includes(q),
    );
  }
  if (source) jobs = jobs.filter((j) => j.source === source);
  if (remote !== null) jobs = jobs.filter((j) => j.remote === remote);
  if (level !== 'all') jobs = jobs.filter((j) => j.fresher.level === level);
  if (lang !== 'all') jobs = jobs.filter((j) => j.language === 'en');

  jobs = jobs.slice().sort((a, b) => {
    if (sort === 'relevant') {
      const byConf = (CONFIDENCE_SCORE[b.fresher.confidence] || 0) - (CONFIDENCE_SCORE[a.fresher.confidence] || 0);
      if (byConf !== 0) return byConf;
    }
    return new Date(b.postedAt) - new Date(a.postedAt);
  });

  const total = jobs.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;
  const pageJobs = jobs.slice(start, start + limit);

  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    jobs: pageJobs,
    total,
    page: safePage,
    pages,
    limit,
    sources: pool.meta,
    updatedAt: pool.updatedAt,
  });
});

// GET /api/meta — source status + counts (handy for a status bar / debugging).
router.get('/meta', async (req, res) => {
  try {
    const pool = await getPool();
    const eligible = pool.jobs.filter((j) => j.fresher.eligible).length;
    res.json({
      totalFetched: pool.jobs.length,
      fresherEligible: eligible,
      sources: pool.meta,
      updatedAt: pool.updatedAt,
    });
  } catch (err) {
    res.status(502).json({ error: 'Sources unavailable', sources: [] });
  }
});

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export default router;
