// Direct company career pages that publish schema.org JobPosting structured
// data — the same markup Google requires for Google for Jobs indexing. This
// covers companies with a custom-built career page that isn't on one of the
// ATS platforms atsBoards.js already talks to directly via API (Greenhouse/
// Lever/Ashby/SmartRecruiters/Workable). Company list lives in
// config/india.yaml (sources.company_page_urls) — add a company there, not
// in code, same one-line-edit pattern as sources.ats_companies.
//
// This reads structured data the company already publishes for search
// engines to consume — same posture as Googlebot, not scraping arbitrary
// markup — and respects robots.txt (server/src/util/robotsTxt.js) at a
// conservative one-page-per-company-per-cycle rate.
//
// Coverage caveat, by design: a company whose career page doesn't publish
// this structured data (common on JS-rendered SPA career pages with no SEO
// investment) silently yields 0 postings from this source — logged as a
// healthy empty fetch, not an error, same as any other source with nothing
// new to report.
import crypto from 'node:crypto';
import { normalizeProviderJob } from './provider.js';
import { mapConcurrent, withRetry } from '../util/fetchJson.js';
import { stripHtml } from '../util/html.js';
import { extractJobPostings } from '../util/jsonld.js';
import { isAllowedByRobots } from '../util/robotsTxt.js';

export const SOURCE_NAME = 'company_pages';

export async function fetchJobs(cfg) {
  const pages = cfg.sources?.company_page_urls || [];
  if (!pages.length) return [];

  const limit = cfg.rate_limits?.max_concurrent_per_source || 3;
  const results = await mapConcurrent(pages, limit, (page) =>
    withRetry(() => fetchPage(page), cfg).catch(() => ({ page, postings: [] })),
  );

  return results.flatMap(({ page, postings }) => postings.map((p) => normalize(p, page)).filter(Boolean));
}

async function fetchPage(page) {
  const allowed = await isAllowedByRobots(page.url);
  if (!allowed) return { page, postings: [] };

  const res = await fetch(page.url, {
    headers: { 'User-Agent': 'JobScoutBot/1.0 (+https://github.com/tejas6996/Job_scout)' },
  });
  if (!res.ok) throw new Error(`company page ${page.url} responded ${res.status}`);
  const html = await res.text();
  return { page, postings: extractJobPostings(html) };
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function firstPlace(jobLocation) {
  if (!jobLocation) return null;
  return Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
}

function extractLocationText(posting) {
  const address = firstPlace(posting.jobLocation)?.address;
  if (!address) return '';
  return [address.addressLocality, address.addressRegion].filter(Boolean).join(', ');
}

function isRemote(posting) {
  const type = posting.jobLocationType;
  return type === 'TELECOMMUTE' || (Array.isArray(type) && type.includes('TELECOMMUTE'));
}

// Converts schema.org's numeric baseSalary into the LPA/monthly-stipend
// phrasing server/src/compensation.js already parses reliably, rather than
// teaching that parser a second numeric format. Skips any non-rupee
// currency outright — this dashboard is India-scoped, and mislabeling a
// foreign-currency figure as lakhs would be actively wrong, not just
// unparsed.
function extractCompensationText(posting) {
  const salary = posting.baseSalary;
  const value = salary?.value;
  if (!value) return '';
  const currency = String(salary.currency || '').toUpperCase();
  if (currency && currency !== 'INR') return '';

  const min = Number(value.minValue ?? value.value);
  const max = Number(value.maxValue ?? value.value);
  if (!Number.isFinite(min)) return '';
  const unit = String(value.unitText || '').toUpperCase();

  if (unit === 'MONTH') {
    return max && max !== min ? `₹${min}-${max}/month` : `₹${min}/month`;
  }
  const minLpa = min / 100000;
  const maxLpa = max / 100000;
  return maxLpa && maxLpa !== minLpa ? `₹${minLpa}-${maxLpa} LPA` : `₹${minLpa} LPA`;
}

function extractExperienceText(posting) {
  const req = posting.experienceRequirements;
  if (!req) return '';
  if (typeof req === 'string') return req;
  if (req.monthsOfExperience != null) return `${req.monthsOfExperience} months`;
  return '';
}

function extractLogo(logo) {
  if (!logo) return null;
  if (typeof logo === 'string') return logo;
  return logo.url || logo.contentUrl || null;
}

function normalize(posting, page) {
  if (!posting?.title) return null;
  const url = posting.url || page.url;
  if (!url) return null;

  const employmentTypes = (Array.isArray(posting.employmentType) ? posting.employmentType : [posting.employmentType])
    .filter(Boolean)
    .map(String);
  const isInternship = employmentTypes.some((t) => /intern/i.test(t));

  const experienceText = extractExperienceText(posting);
  const descriptionText = [
    stripHtml(posting.description || ''),
    isInternship ? 'Internship position.' : '',
    experienceText ? `Experience required: ${experienceText}.` : '',
  ].filter(Boolean).join(' ').slice(0, 6000);

  const id = `company_pages-${crypto.createHash('md5').update(url).digest('hex').slice(0, 16)}`;

  return normalizeProviderJob({
    id,
    title: String(posting.title).trim(),
    company: page.company || posting.hiringOrganization?.name || hostnameOf(page.url) || 'Unknown',
    companyLogo: extractLogo(posting.hiringOrganization?.logo),
    url,
    location: extractLocationText(posting),
    remote: isRemote(posting),
    postedAt: posting.datePosted ? new Date(posting.datePosted).toISOString() : new Date().toISOString(),
    tags: [],
    category: null,
    jobType: employmentTypes.join(', ') || null,
    compensationText: extractCompensationText(posting),
    experienceText,
    rawLevel: '',
    descriptionText,
  }, SOURCE_NAME);
}
