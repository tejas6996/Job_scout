// Jobicy — remote jobs API. Free, no key required.
// Docs: https://jobicy.com/jobs-rss-feed  (JSON: /api/v2/remote-jobs)
import { fetchJson } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';

export const SOURCE_NAME = 'jobicy';

const ENDPOINT = 'https://jobicy.com/api/v2/remote-jobs?count=50';

export async function fetchJobs() {
  const data = await fetchJson(ENDPOINT);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map(normalize).filter(Boolean);
}

function normalize(j) {
  if (!j || !j.url || !j.jobTitle) return null;
  return {
    id: `jobicy-${j.id}`,
    source: SOURCE_NAME,
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
    salary: j.annualSalaryMin && j.annualSalaryMax
      ? `${j.salaryCurrency || ''} ${j.annualSalaryMin}-${j.annualSalaryMax}`.trim()
      : null,
    rawLevel: j.jobLevel || '',
    // Evaluate against the full description so experience requirements buried
    // deep in the posting (e.g. "5+ years") are caught by the fresher filter.
    descriptionText: stripHtml(j.jobDescription || j.jobExcerpt || ''),
  };
}

function toIso(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
