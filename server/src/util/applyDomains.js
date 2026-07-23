// Single source of truth for "is this apply link a third-party job board/
// aggregator, or the employer's own site (including their own ATS-hosted
// board — Greenhouse/Lever/Ashby/SmartRecruiters/Workable, which count as
// official since the employer set those up as their direct application
// flow)?" Used by:
//  - server/src/verify/linkChecker.js — the final gate, checked against the
//    *resolved* URL after following redirects.
//  - server/src/sources/jsearch.js — picks the best of several apply
//    options up front, so we don't even need the redirect-chasing gate to
//    catch an avoidable third-party pick.
// Sourcing stays broad (JSearch/Adzuna/etc. keep pulling from wherever a
// posting is syndicated, including Naukri/Indeed/LinkedIn) — this only
// governs which *apply link* ends up in front of the user.
export const THIRD_PARTY_APPLY_DOMAINS = [
  'naukri.com', 'apna.co', 'indeed.com', 'indeed.co.in', 'monsterindia.com',
  'shine.com', 'timesjobs.com', 'foundit.in', 'foundit.com', 'instahyre.com',
  'hirist.com', 'internshala.com', 'unstop.com', 'linkedin.com',
  'glassdoor.com', 'glassdoor.co.in', 'wellfound.com', 'angel.co',
  'ziprecruiter.com', 'simplyhired.com', 'talent.com',
];

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isThirdPartyHost(hostname) {
  if (!hostname) return false;
  return THIRD_PARTY_APPLY_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

// true (official/acceptable) unless it's a confirmed third-party host;
// null only when hostname couldn't be determined at all (e.g. bad URL).
export function classifyHost(hostname) {
  if (!hostname) return null;
  return isThirdPartyHost(hostname) ? false : true;
}

// Picks the most direct URL out of a set of candidate apply links (e.g.
// JSearch's apply_options, which can include the company's own career site
// alongside LinkedIn/Naukri/Indeed listings for the same job) — prefers the
// first one that resolves to a non-third-party domain, falls back to the
// first candidate at all if every option is third-party (still surfaces the
// job; verifyApplyLink's post-redirect check is the final safety net).
export function pickBestApplyLink(urls) {
  const candidates = urls.filter(Boolean);
  const official = candidates.find((u) => classifyHost(hostnameOf(u)) !== false);
  return official || candidates[0] || null;
}
