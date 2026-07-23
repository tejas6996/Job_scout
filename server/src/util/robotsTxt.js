// Minimal robots.txt respecter for server/src/sources/companyPages.js — this
// project fetches at most one page per configured company per refresh
// cycle, so a full crawler-grade parser (wildcards, Allow overrides,
// crawl-delay) is overkill; a plain `User-agent: *` / `Disallow:` prefix
// check covers the common case. No robots.txt reachable (404, network
// error) is treated as unrestricted, matching typical crawler behavior for
// a low-volume, single-page fetch.
const cache = new Map(); // origin -> disallowed path prefixes

function parseDisallowRules(text) {
  const rules = [];
  let inWildcardGroup = false;
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (/^user-agent:/i.test(line)) {
      const agent = line.split(':').slice(1).join(':').trim();
      inWildcardGroup = agent === '*';
    } else if (inWildcardGroup && /^disallow:/i.test(line)) {
      const path = line.split(':').slice(1).join(':').trim();
      if (path) rules.push(path);
    }
  }
  return rules;
}

async function getDisallowedPaths(origin) {
  if (cache.has(origin)) return cache.get(origin);

  let disallowed = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': 'JobScoutBot/1.0 (+https://github.com/tejas6996/Job_scout)' },
    });
    if (res.ok) disallowed = parseDisallowRules(await res.text());
  } catch {
    // unreachable robots.txt — default to unrestricted
  }

  cache.set(origin, disallowed);
  return disallowed;
}

export async function isAllowedByRobots(url) {
  try {
    const u = new URL(url);
    const disallowed = await getDisallowedPaths(u.origin);
    return !disallowed.some((prefix) => u.pathname.startsWith(prefix));
  } catch {
    return true; // malformed URL — let the actual fetch fail on its own terms
  }
}

// Test/internal helper.
export function __clearRobotsCacheForTests() {
  cache.clear();
}
