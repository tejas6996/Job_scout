// Aggregates every source into one normalized, fresher-scored job pool.
// Uses Promise.allSettled so one failing/slow source never takes down the rest.
import * as jobicy from './jobicy.js';
import * as remotive from './remotive.js';
import * as arbeitnow from './arbeitnow.js';
import { evaluateFresher } from '../fresher.js';
import { excerpt } from '../util/html.js';
import { detectLanguage } from '../util/lang.js';

const SOURCES = [jobicy, remotive, arbeitnow];

// Drop stale postings so freshers don't apply to roles that are long filled.
const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 60);
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function isFresh(postedAt) {
  const t = new Date(postedAt).getTime();
  if (!Number.isFinite(t)) return true; // keep if the date is unparseable
  const age = Date.now() - t;
  return age <= MAX_AGE_MS && age >= -2 * 24 * 60 * 60 * 1000; // allow small clock skew
}

export async function fetchAllJobs() {
  const settled = await Promise.allSettled(SOURCES.map((s) => s.fetchJobs()));

  const collected = [];
  const meta = [];

  settled.forEach((result, i) => {
    const name = SOURCES[i].SOURCE_NAME;
    if (result.status === 'fulfilled') {
      collected.push(...result.value);
      meta.push({ source: name, ok: true, count: result.value.length });
    } else {
      meta.push({
        source: name,
        ok: false,
        count: 0,
        error: String(result.reason?.message || result.reason),
      });
    }
  });

  const seen = new Set();
  const jobs = [];

  for (const job of collected) {
    if (!isFresh(job.postedAt)) continue;

    // De-duplicate the same posting surfaced by more than one source.
    const key = `${job.title}::${job.company}`.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);

    const fresher = evaluateFresher({
      title: job.title,
      tags: job.tags,
      levelField: job.rawLevel,
      text: job.descriptionText,
    });

    const shortExcerpt = excerpt(job.descriptionText, 220);
    const language = detectLanguage(`${job.title} ${shortExcerpt}`);

    jobs.push({
      id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      companyLogo: job.companyLogo,
      url: job.url,
      location: job.location,
      remote: job.remote,
      postedAt: job.postedAt,
      tags: job.tags,
      category: job.category,
      jobType: job.jobType,
      salary: job.salary,
      language,
      excerpt: shortExcerpt,
      fresher,
    });
  }

  return { jobs, meta };
}
