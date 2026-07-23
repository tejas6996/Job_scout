// Adzuna — India-scoped at the API level (country=in), one of the two paid-
// tier-free sources this pipeline can pull real Indian listings from. Keyed
// by ADZUNA_APP_ID / ADZUNA_APP_KEY (server/.env) — returns [] when unset so
// a missing key degrades gracefully instead of breaking the run.
// Docs: https://developer.adzuna.com/
import { normalizeProviderJob } from './provider.js';
import { canonicalLabel } from '../location.js';
import { withRetry } from '../util/fetchJson.js';
import { buildRoleQuery } from './roleQuery.js';

export const SOURCE_NAME = 'adzuna';

const CITY_LABELS = {
  bengaluru: 'Bengaluru',
  gurugram: 'Gurugram',
  delhi_ncr: 'Delhi',
  mumbai: 'Mumbai',
  hyderabad: 'Hyderabad',
  pune: 'Pune',
  chennai: 'Chennai',
  noida: 'Noida',
  kolkata: 'Kolkata',
  ahmedabad: 'Ahmedabad',
  coimbatore: 'Coimbatore',
};

export async function fetchJobs(cfg) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const roleQuery = buildRoleQuery(cfg);
  const resultsPerPage = String(cfg.rate_limits?.results_per_source || 50);
  const priority = (cfg.locations.priority || []).filter((k) => CITY_LABELS[k]);
  const targets = priority.length ? priority.map((k) => CITY_LABELS[k]) : [undefined];

  const pages = await Promise.all(
    targets.map(async (where) => {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        what_or: roleQuery,
        title_only: '1', // match against the job title, not full text — matches the spec's "title reasonably matches" rule and cuts out postings that only mention a role term in the body
        max_days_old: String(cfg.freshness.max_age_days),
        results_per_page: resultsPerPage,
        sort_by: 'date',
        'content-type': 'application/json',
      });
      if (where) params.set('where', where);
      const body = await withRetry(() => fetchAdzunaPage(params), cfg);
      return body?.results || [];
    }),
  );

  return pages.flat().map(normalize).filter(Boolean);
}

async function fetchAdzunaPage(params) {
  const res = await fetch(`https://api.adzuna.com/v1/api/jobs/in/search/1?${params}`);
  if (!res.ok) throw new Error(`Adzuna responded ${res.status}`);
  return res.json();
}

function normalize(j) {
  if (!j || !j.redirect_url || !j.title) return null;
  const compensationText = j.salary_min && j.salary_max ? `${j.salary_min}-${j.salary_max}` : '';
  return normalizeProviderJob({
    id: `adzuna-${j.id}`,
    title: String(j.title).trim(),
    company: j.company?.display_name || 'Unknown',
    companyLogo: null,
    url: j.redirect_url,
    location: j.location?.display_name || '',
    remote: false,
    postedAt: j.created || new Date().toISOString(),
    tags: [],
    category: j.category?.label || null,
    jobType: j.contract_time || null,
    compensationText,
    experienceText: '',
    rawLevel: '',
    descriptionText: j.description || '',
  }, SOURCE_NAME);
}

// Re-exported so tests/location.js can reuse the same label table without
// duplicating it.
export { CITY_LABELS };
