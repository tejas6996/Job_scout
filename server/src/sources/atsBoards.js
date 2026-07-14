// Direct company career pages via their ATS API — Greenhouse and Lever both
// publish a free, keyless, unbounded-per-company JSON feed of open roles.
// This is the "direct company career pages" source the spec asks for.
// Company list lives in config/india.yaml (sources.ats_companies) — add a
// company there, not in code.
import { normalizeProviderJob } from './provider.js';
import { mapConcurrent, withRetry } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';

// Greenhouse's `content` field comes back HTML-entity-escaped (literal
// "&lt;div&gt;" rather than "<div>"), so tags must be un-escaped before
// stripHtml can strip them — otherwise the tag-stripping regex finds
// nothing to strip and raw markup leaks into the excerpt.
function cleanGreenhouseContent(raw) {
  const unescaped = String(raw || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return stripHtml(unescaped);
}

export const SOURCE_NAME = 'ats_boards';

export async function fetchJobs(cfg) {
  const companies = cfg.sources.ats_companies || [];
  if (!companies.length) return [];

  const limit = cfg.rate_limits?.max_concurrent_per_source || 3;
  const results = await mapConcurrent(companies, limit, (company) =>
    withRetry(() => fetchCompany(company), cfg).catch(() => ({ company, jobs: [] })),
  );

  return results.flatMap(({ company, jobs }) =>
    jobs.map((j) => normalize(j, company)).filter(Boolean),
  );
}

async function fetchCompany(company) {
  const url =
    company.type === 'greenhouse'
      ? `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`
      : `https://api.lever.co/v0/postings/${company.token}?mode=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${company.type} board ${company.token} responded ${res.status}`);
  const body = await res.json();
  const jobs = company.type === 'lever' ? (Array.isArray(body) ? body : []) : body?.jobs || [];
  return { company, jobs };
}

function normalize(j, company) {
  if (company.type === 'lever') {
    if (!j?.hostedUrl || !j?.text) return null;
    return normalizeProviderJob({
      id: `lever-${j.id}`,
      title: String(j.text).trim(),
      company: company.token,
      companyLogo: null,
      url: j.hostedUrl,
      location: j.categories?.location || '',
      remote: /remote/i.test(j.categories?.location || ''),
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
      tags: [],
      category: j.categories?.team || null,
      jobType: j.categories?.commitment || null,
      compensationText: '',
      experienceText: '',
      rawLevel: '',
      descriptionText: (j.descriptionPlain || '').slice(0, 6000),
    }, SOURCE_NAME);
  }

  if (!j?.absolute_url || !j?.title) return null;
  return normalizeProviderJob({
    id: `greenhouse-${j.id}`,
    title: String(j.title).trim(),
    company: j.company?.name || company.token,
    companyLogo: null,
    url: j.absolute_url,
    location: j.location?.name || '',
    remote: /remote/i.test(j.location?.name || ''),
    postedAt: j.updated_at || new Date().toISOString(),
    tags: [],
    category: null,
    jobType: null,
    compensationText: '',
    experienceText: '',
    rawLevel: '',
    descriptionText: cleanGreenhouseContent(j.content).slice(0, 6000),
  }, SOURCE_NAME);
}
