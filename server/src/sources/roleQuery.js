// Builds a role-targeted search query from config/roles.yaml's taxonomy —
// the actual data/analytics/ML/BI target list — instead of india.yaml's
// generic `roles.include_keywords` (software engineer/swe/developer/...),
// which is what jsearch.js/adzuna.js used before this and is why the
// Bengaluru funnel was landing on 0 kept jobs: JSearch truncated that list
// to its first 3 (all generic SWE terms, no data/analyst/ML terms at all)
// and Adzuna's first 8 stopped just short of "machine learning"/"data
// science"/"ai engineer" — neither fetcher was ever searching for the roles
// the two-gate filter is actually trying to keep.
//
// When config/roles.yaml's active_families or config/india.yaml's
// active_role_types narrow the gates (server/src/filters/index.js), this
// narrows the fetch itself to match — no point spending fetch/API budget
// pulling in postings the gates are just going to drop anyway.
const DEFAULT_FRESHER_QUALIFIER = 'fresher OR trainee OR junior OR intern OR graduate';
const ROLE_TYPE_QUERY_WORDS = {
  internship: 'intern OR internship',
  apprenticeship: 'apprentice OR apprenticeship',
  trainee: 'trainee OR graduate engineer trainee OR GET',
  full_time_entry: 'fresher OR entry level OR junior OR graduate',
};

// Bounded so the query string stays well under any provider's length limit
// even with every core family included (there are 8 today).
const MAX_FAMILY_TERMS = 8;

function familyTerms(cfg) {
  const families = cfg.roleTaxonomy?.families || {};
  const activeFamilies = cfg.roleTaxonomy?.active_families;

  if (activeFamilies?.length) {
    return activeFamilies
      .map((key) => families[key]?.canonical)
      .filter(Boolean);
  }

  return Object.values(families)
    .filter((f) => f.tier === 'core')
    .map((f) => f.canonical);
}

function fresherQualifier(cfg) {
  const activeRoleTypes = cfg.experience?.active_role_types;
  if (!activeRoleTypes?.length) return DEFAULT_FRESHER_QUALIFIER;

  const words = activeRoleTypes.map((t) => ROLE_TYPE_QUERY_WORDS[t]).filter(Boolean);
  return words.length ? words.join(' OR ') : DEFAULT_FRESHER_QUALIFIER;
}

// includeFresherQualifier: JSearch's `query` param is natural-language
// search text, so appending the qualifier just nudges relevance — harmless.
// Adzuna's `what_or` is a strict inclusive-OR match list; flat-OR-ing bare
// words like "junior"/"intern" into it would match any unrelated posting
// that happens to mention them, diluting precision rather than improving
// it — so Adzuna's caller should omit the qualifier and rely on the (real)
// experience/role gates downstream instead.
export function buildRoleQuery(cfg, { includeFresherQualifier = false } = {}) {
  const roleSegment = familyTerms(cfg).slice(0, MAX_FAMILY_TERMS).join(' OR ');
  if (!roleSegment) return fresherQualifier(cfg); // defensive: an empty taxonomy shouldn't produce an empty query
  return includeFresherQualifier ? `${roleSegment} OR ${fresherQualifier(cfg)}` : roleSegment;
}
