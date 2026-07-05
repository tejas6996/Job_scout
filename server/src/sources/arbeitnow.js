// Arbeitnow — job board API (Europe-focused, many remote roles). Free, no key.
// Docs: https://www.arbeitnow.com/api
import { fetchJson } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';

export const SOURCE_NAME = 'arbeitnow';

const ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api';

export async function fetchJobs() {
  const data = await fetchJson(ENDPOINT);
  const jobs = Array.isArray(data?.data) ? data.data : [];
  return jobs.map(normalize).filter(Boolean);
}

function normalize(j) {
  if (!j || !j.url || !j.title) return null;
  return {
    id: `arbeitnow-${j.slug}`,
    source: SOURCE_NAME,
    title: String(j.title).trim(),
    company: String(j.company_name || 'Unknown').trim(),
    companyLogo: null,
    url: j.url,
    location: j.location || (j.remote ? 'Remote' : 'Unknown'),
    remote: Boolean(j.remote),
    postedAt: toIso(j.created_at),
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
    category: Array.isArray(j.tags) ? j.tags[0] : null,
    jobType: Array.isArray(j.job_types) ? j.job_types[0] : null,
    salary: null,
    rawLevel: Array.isArray(j.job_types) ? j.job_types.join(' ') : '',
    descriptionText: stripHtml(j.description || ''),
  };
}

function toIso(seconds) {
  const ms = Number(seconds) * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
