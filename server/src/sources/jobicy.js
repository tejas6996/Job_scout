// Jobicy — remote jobs API. Free, no key required. Global-remote, not
// India-scoped at the API level (Jobicy has no country param), so this
// provider only contributes "Remote – India" candidates — location.js and
// the fresher/location filters downstream decide what actually qualifies.
// Docs: https://jobicy.com/jobs-rss-feed  (JSON: /api/v2/remote-jobs)
import { fetchJson } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';
import { normalizeProviderJob } from './provider.js';

export const SOURCE_NAME = 'jobicy';

const ENDPOINT = 'https://jobicy.com/api/v2/remote-jobs?count=50';

export async function fetchJobs() {
  const data = await fetchJson(ENDPOINT);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map(normalize).filter(Boolean);
}

function normalize(j) {
  if (!j || !j.url || !j.jobTitle) return null;
  const compensationText = j.annualSalaryMin && j.annualSalaryMax
    ? `${j.salaryCurrency || ''} ${j.annualSalaryMin}-${j.annualSalaryMax}`.trim()
    : '';
  return normalizeProviderJob({
    id: `jobicy-${j.id}`,
    title: String(j.jobTitle).trim(),
    company: String(j.companyName || 'Unknown').trim(),
    companyLogo: j.companyLogo || null,
    url: j.url,
    location: j.jobGeo || 'Remote',
    remote: true,
    postedAt: toIso(j.pubDate),
    tags: Array.isArray(j.jobIndustry) ? j.jobIndustry.slice(0, 6) : [],
    category: Array.isArray(j.jobIndustry) ? j.jobIndustry[0] : null,
    jobType: Array.isArray(j.jobType) ? j.jobType[0] : j.jobType || null,
    compensationText,
    experienceText: '',
    rawLevel: j.jobLevel || '',
    // Evaluate against the full description so experience requirements buried
    // deep in the posting (e.g. "5+ years") are caught by the fresher filter.
    descriptionText: stripHtml(j.jobDescription || j.jobExcerpt || ''),
  }, SOURCE_NAME);
}

function toIso(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
