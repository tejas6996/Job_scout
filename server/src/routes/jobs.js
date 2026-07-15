import express from 'express';
import { getPool } from '../pool.js';
import { PROVIDER_NAMES } from '../sources/index.js';
import { scopedLocations, canonicalLabel } from '../location.js';

const router = express.Router();

const VALID_SOURCES = new Set(PROVIDER_NAMES);
const VALID_SORTS = new Set(['recent', 'relevant', 'deadline']);
const VALID_ROLE_TYPES = new Set(['all', 'internship', 'apprenticeship', 'trainee', 'full_time_entry']);
// Respects config/india.yaml's locations.scope — e.g. just ['bengaluru']
// when the dashboard is scoped to one region, not every canonical location.
const VALID_LOCATIONS = new Set(['all', ...scopedLocations()]);

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
  const roleType = VALID_ROLE_TYPES.has(req.query.level) ? req.query.level : 'all';
  const location = VALID_LOCATIONS.has(req.query.location) ? req.query.location : 'all';
  const sort = VALID_SORTS.has(req.query.sort) ? req.query.sort : 'relevant';
  const page = clampInt(req.query.page, 1, 1, 1000);
  const limit = clampInt(req.query.limit, 24, 1, 60);

  // pool.jobs only ever contains fresher-eligible jobs — filtering already
  // happened in server/src/sources/index.js (Stage A/B classification).
  let jobs = pool.jobs;

  if (q) {
    jobs = jobs.filter((j) =>
      `${j.title} ${j.company} ${j.location} ${(j.tags || []).join(' ')}`.toLowerCase().includes(q),
    );
  }
  if (source) jobs = jobs.filter((j) => j.source === source);
  if (remote !== null) jobs = jobs.filter((j) => j.remote === remote);
  if (roleType !== 'all') jobs = jobs.filter((j) => j.fresher.role_type === roleType);
  if (location !== 'all') jobs = jobs.filter((j) => j.locationCanonical === location);

  jobs = jobs.slice().sort((a, b) => {
    if (sort === 'relevant') return (b.fitScore || 0) - (a.fitScore || 0);
    if (sort === 'deadline') {
      const aHas = a.applyBy ? new Date(a.applyBy).getTime() : Infinity;
      const bHas = b.applyBy ? new Date(b.applyBy).getTime() : Infinity;
      if (aHas !== bHas) return aHas - bHas;
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

// GET /api/meta — source status + counts + the canonical location list
// (handy for building the location filter dropdown / a status bar).
router.get('/meta', async (req, res) => {
  try {
    const pool = await getPool();
    res.json({
      totalKept: pool.jobs.length,
      sources: pool.meta,
      updatedAt: pool.updatedAt,
      locations: scopedLocations().map((key) => ({ key, label: canonicalLabel(key) })),
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
