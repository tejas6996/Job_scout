// Direct company career pages via their ATS's public API. Every one of
// these (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) publishes a
// free, keyless, per-company JSON feed of open roles — no scraping. This is
// the "direct company career pages" source the spec asks for. Company list
// lives in config/india.yaml (sources.ats_companies) — add a company there,
// not in code. Every company token below was verified live (200 + real
// Bengaluru postings) before being added, not guessed.
import { normalizeProviderJob } from './provider.js';
import { mapConcurrent, withRetry } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';

export const SOURCE_NAME = 'ats_boards';

// Greenhouse's `content` field comes back HTML-entity-escaped (literal
// "&lt;div&gt;" rather than "<div>"), so tags must be un-escaped before
// stripHtml can strip them — otherwise the tag-stripping regex finds
// nothing to strip and raw markup leaks into the excerpt.
function cleanGreenhouseContent(raw) {
  const unescaped = String(raw || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return stripHtml(unescaped);
}

export async function fetchJobs(cfg) {
  const companies = cfg.sources.ats_companies || [];
  if (!companies.length) return [];

  const limit = cfg.rate_limits?.max_concurrent_per_source || 3;
  const results = await mapConcurrent(companies, limit, (company) =>
    withRetry(() => fetchCompany(company), cfg).catch(() => ({ company, jobs: [] })),
  );

  return results.flatMap(({ company, jobs }) => jobs.map((j) => normalize(j, company)).filter(Boolean));
}

async function fetchCompany(company) {
  switch (company.type) {
    case 'greenhouse':
      return fetchSimpleJson(company, `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`, (body) => body?.jobs || []);
    case 'lever':
      return fetchSimpleJson(company, `https://api.lever.co/v0/postings/${company.token}?mode=json`, (body) => (Array.isArray(body) ? body : []));
    case 'ashby':
      return fetchSimpleJson(company, `https://api.ashbyhq.com/posting-api/job-board/${company.token}`, (body) => body?.jobs || []);
    case 'workable':
      return fetchSimpleJson(company, `https://apply.workable.com/api/v1/widget/accounts/${company.token}`, (body) => body?.jobs || []);
    case 'smartrecruiters':
      return fetchSmartRecruiters(company);
    default:
      throw new Error(`Unknown ATS type: ${company.type}`);
  }
}

async function fetchSimpleJson(company, url, extractJobs) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${company.type} board ${company.token} responded ${res.status}`);
  const body = await res.json();
  return { company, jobs: extractJobs(body) };
}

// SmartRecruiters paginates (100 postings/page) and its list endpoint
// doesn't include full job descriptions or a public apply URL (those live
// behind a per-posting detail endpoint) — rather than N+1 fetch every
// posting, normalize() below builds a synthetic description from the list
// endpoint's structured fields (experienceLevel/function/department) and
// constructs the public URL directly (verified live: SmartRecruiters
// resolves https://jobs.smartrecruiters.com/{company}/{id} regardless of
// the descriptive slug suffix).
async function fetchSmartRecruiters(company) {
  const jobs = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 10; page += 1) { // hard cap: 1000 postings/company is plenty
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${company.token}/postings?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`smartrecruiters board ${company.token} responded ${res.status}`);
    const body = await res.json();
    const content = body?.content || [];
    jobs.push(...content);
    offset += limit;
    if (offset >= (body?.totalFound || 0) || content.length === 0) break;
  }
  return { company, jobs };
}

function normalize(j, company) {
  switch (company.type) {
    case 'lever':
      return normalizeLever(j, company);
    case 'greenhouse':
      return normalizeGreenhouse(j, company);
    case 'ashby':
      return normalizeAshby(j, company);
    case 'workable':
      return normalizeWorkable(j, company);
    case 'smartrecruiters':
      return normalizeSmartRecruiters(j, company);
    default:
      return null;
  }
}

function normalizeLever(j, company) {
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

function normalizeGreenhouse(j, company) {
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

function normalizeAshby(j, company) {
  if (!j?.jobUrl || !j?.title) return null;
  return normalizeProviderJob({
    id: `ashby-${j.id}`,
    title: String(j.title).trim(),
    company: company.token,
    companyLogo: null,
    url: j.jobUrl,
    location: j.location || j.secondaryLocations?.[0]?.location || '',
    remote: Boolean(j.isRemote),
    postedAt: j.publishedAt || new Date().toISOString(),
    tags: [],
    category: j.department || j.team || null,
    jobType: j.employmentType || null,
    compensationText: '',
    experienceText: '',
    rawLevel: '',
    descriptionText: stripHtml(j.descriptionHtml || '').slice(0, 6000),
  }, SOURCE_NAME);
}

// Workable's list endpoint has no free-text description field — only
// structured metadata. Fold it into a synthetic description so Stage A
// still has something to scan (department/function/industry give context,
// "experience"/"education" carry a real fresher/senior signal e.g. "Entry
// level", "Associate", "Internship", "Director").
function normalizeWorkable(j, company) {
  if (!j?.application_url && !j?.url) return null;
  if (!j?.title) return null;
  const location = [j.city, j.state, j.country].filter(Boolean).join(', ');
  const descriptionText = [
    j.department, j.function, j.industry,
    j.experience ? `Experience level: ${j.experience}` : '',
    j.education ? `Education: ${j.education}` : '',
  ].filter(Boolean).join('. ');

  return normalizeProviderJob({
    id: `workable-${j.shortcode}`,
    title: String(j.title).trim(),
    company: company.token,
    companyLogo: null,
    url: j.application_url || j.url,
    location,
    remote: Boolean(j.telecommuting),
    postedAt: j.published_on ? new Date(j.published_on).toISOString() : new Date().toISOString(),
    tags: [],
    category: j.department || null,
    jobType: j.employment_type || null,
    compensationText: '',
    experienceText: '',
    rawLevel: j.experience || '',
    descriptionText,
  }, SOURCE_NAME);
}

// SmartRecruiters' list endpoint also has no free-text description (full
// jobAd.sections live behind a per-posting detail fetch) — same synthetic-
// description approach as Workable, using its experienceLevel/function/
// department fields, which use the same "Entry Level"/"Associate"/"Mid-
// Senior Level"/"Director"/"Executive" taxonomy Stage A already recognizes.
function normalizeSmartRecruiters(j, company) {
  if (!j?.id || !j?.name) return null;
  const descriptionText = [
    j.function?.label, j.department?.label,
    j.experienceLevel?.label ? `Experience level: ${j.experienceLevel.label}` : '',
  ].filter(Boolean).join('. ');

  return normalizeProviderJob({
    id: `sr-${j.id}`,
    title: String(j.name).trim(),
    company: j.company?.name || company.token,
    companyLogo: null,
    url: `https://jobs.smartrecruiters.com/${company.token}/${j.id}`,
    location: j.location?.fullLocation || j.location?.city || '',
    remote: Boolean(j.location?.remote),
    postedAt: j.releasedDate || new Date().toISOString(),
    tags: [],
    category: j.function?.label || null,
    jobType: j.typeOfEmployment?.label || null,
    compensationText: '',
    experienceText: '',
    rawLevel: j.experienceLevel?.label || '',
    descriptionText,
  }, SOURCE_NAME);
}
