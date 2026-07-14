// JSearch (RapidAPI) — India-scoped at the API level (country=in). Keyed by
// JSEARCH_API_KEY (server/.env) — this key has a fixed *total* request cap
// (not daily), so we deliberately fire one request per priority location
// rather than paginating deeply.
// Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
import { normalizeProviderJob } from './provider.js';
import { withRetry } from '../util/fetchJson.js';

export const SOURCE_NAME = 'jsearch';

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
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) return [];

  const roleQuery = (cfg.roles.include_keywords || []).slice(0, 3).join(' OR ');
  const priority = (cfg.locations.priority || []).filter((k) => CITY_LABELS[k]);
  const cities = priority.length ? priority.map((k) => CITY_LABELS[k]) : ['India'];

  const batches = await Promise.all(
    cities.map(async (city) => {
      const query = `${roleQuery} jobs in ${city}, India`;
      const params = new URLSearchParams({
        query,
        country: 'in',
        date_posted: 'week',
        page: '1',
        num_pages: '1',
      });
      const body = await withRetry(() => fetchJSearchPage(apiKey, params), cfg);
      return body?.data || [];
    }),
  );

  return batches.flat().map(normalize).filter(Boolean);
}

async function fetchJSearchPage(apiKey, params) {
  const res = await fetch(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    headers: { 'x-rapidapi-host': 'jsearch.p.rapidapi.com', 'x-rapidapi-key': apiKey },
  });
  if (!res.ok) throw new Error(`JSearch responded ${res.status}`);
  return res.json();
}

function normalize(j) {
  const applyLink = j.apply_options?.[0]?.apply_link || j.job_apply_link;
  if (!j || !applyLink || !j.job_title) return null;
  const months = j.job_required_experience?.required_experience_in_months;
  const salaryText = j.job_min_salary && j.job_max_salary ? `${j.job_min_salary}-${j.job_max_salary}` : '';
  return normalizeProviderJob({
    id: `jsearch-${j.job_id}`,
    title: String(j.job_title).trim(),
    company: j.employer_name || 'Unknown',
    companyLogo: j.employer_logo || null,
    url: applyLink,
    location: j.job_city || j.job_location || '',
    remote: Boolean(j.job_is_remote),
    postedAt: j.job_posted_at_datetime_utc || new Date().toISOString(),
    tags: [],
    category: null,
    jobType: j.job_employment_type || null,
    compensationText: salaryText,
    experienceText: months != null ? `${months} months` : '',
    rawLevel: '',
    descriptionText: j.job_description || '',
  }, SOURCE_NAME);
}
