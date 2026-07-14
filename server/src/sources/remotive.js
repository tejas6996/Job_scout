// Remotive — remote jobs API. Free, no key required. Global-remote, not
// India-scoped at the API level — like Jobicy, this only contributes
// "Remote – India" candidates (candidate_required_location is the only
// India signal Remotive gives us).
// Docs: https://github.com/remotive-com/remote-jobs-api
import { fetchJson } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';
import { normalizeProviderJob } from './provider.js';

export const SOURCE_NAME = 'remotive';

const ENDPOINT = 'https://remotive.com/api/remote-jobs?limit=100';

export async function fetchJobs() {
  const data = await fetchJson(ENDPOINT);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map(normalize).filter(Boolean);
}

function normalize(j) {
  if (!j || !j.url || !j.title) return null;
  return normalizeProviderJob({
    id: `remotive-${j.id}`,
    title: String(j.title).trim(),
    company: String(j.company_name || 'Unknown').trim(),
    companyLogo: j.company_logo_url || j.company_logo || null,
    url: j.url,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    postedAt: toIso(j.publication_date),
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
    category: j.category || null,
    jobType: j.job_type || null,
    compensationText: j.salary || '',
    experienceText: '',
    rawLevel: '',
    descriptionText: stripHtml(j.description || ''),
  }, SOURCE_NAME);
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  // Remotive timestamps are UTC but lack a timezone marker.
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
