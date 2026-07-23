// GET the apply link, follow redirects, treat any 2xx/3xx as reachable (GET,
// not HEAD, on purpose — some ATS/apply pages 405 on HEAD and would
// otherwise register as false-negative unverified; GET also gives us the
// page body for free, needed for the closed-posting check below).
//
// Beyond plain reachability, this also enforces two harder requirements
// (pipeline.js drops a job on either, unlike a plain unreachable link which
// just gets marked unverified and kept):
//  - officialLink: false only when the link's *final* (post-redirect)
//    domain is a known third-party job board/aggregator (see
//    server/src/util/applyDomains.js) rather than the employer's own site
//    or their own ATS-hosted board (Greenhouse/Lever/Ashby/SmartRecruiters/
//    Workable — those ARE the employer's direct application flow, just
//    hosted elsewhere, so they're not on the blocklist). null when
//    undetermined (fetch failed) — never drop a job just because we
//    couldn't check. Sourcing itself stays broad (jsearch.js already picks
//    the most direct of several apply options up front) — this is just the
//    final safety net on whatever URL actually made it this far.
//  - expiredLink: true only when the fetched page's own text says the
//    posting is closed/filled/expired. null/false otherwise.
import { hostnameOf, classifyHost } from '../util/applyDomains.js';

const CLOSED_PATTERNS =
  /(no longer (accepting|available)|position (has been |is )?(filled|closed)|this (job|position|posting|role) (is|has)\s*(been\s*)?(closed|expired|filled)|job (has\s*)?expired|job is no longer active|applications?\s*(are\s*)?(now\s*)?closed|no longer accepting applications)/i;

export async function verifyApplyLink(url, timeout = 8000) {
  if (!url) return { verified: false, officialLink: null, expiredLink: null, finalUrl: null };

  const initialOfficial = classifyHost(hostnameOf(url));
  if (initialOfficial === false) {
    // Already a known aggregator domain — no need to spend a request finding out.
    return { verified: false, officialLink: false, expiredLink: null, finalUrl: url };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    const finalUrl = res.url || url;
    const officialLink = classifyHost(hostnameOf(finalUrl));
    const verified = res.status >= 200 && res.status < 400;

    let expiredLink = null;
    if (verified) {
      const text = await res.text().catch(() => '');
      expiredLink = CLOSED_PATTERNS.test(text);
    }

    return { verified, officialLink, expiredLink, finalUrl };
  } catch {
    return { verified: false, officialLink: initialOfficial, expiredLink: null, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}
