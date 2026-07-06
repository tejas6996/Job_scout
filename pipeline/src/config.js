import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseAtsCompanies(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadConfig() {
  return {
    LOCATION: process.env.LOCATION || 'Bangalore',
    COUNTRY: process.env.COUNTRY || 'in',
    ROLE_KEYWORDS:
      process.env.ROLE_KEYWORDS ||
      'data analyst,data engineer,business analyst,bi analyst,business intelligence,analytics engineer,machine learning,ml engineer,ai engineer,data science',
    MAX_DAYS: Number(process.env.MAX_DAYS) || 6,
    MAX_EXPERIENCE_YEARS: Number(process.env.MAX_EXPERIENCE_YEARS) || 2,
    INCLUDE_REMOTE: process.env.INCLUDE_REMOTE === 'true',
    ATS_COMPANIES: parseAtsCompanies(process.env.ATS_COMPANIES),
    // Adzuna confirmed max is 50/page on this account's plan.
    RESULTS_PER_SOURCE: Number(process.env.RESULTS_PER_SOURCE) || 50,
    // Adzuna: how many result pages to pull per run (1 page = RESULTS_PER_SOURCE jobs).
    ADZUNA_PAGES: Number(process.env.ADZUNA_PAGES) || 1,
    // JSearch: pages folded into a single request — doesn't cost extra quota,
    // but keep modest since this key has a fixed total-request cap, not a daily one.
    JSEARCH_NUM_PAGES: Number(process.env.JSEARCH_NUM_PAGES) || 3,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',

    NOTION_TOKEN: requireEnv('NOTION_TOKEN'),
    NOTION_DATABASE_ID: requireEnv('NOTION_DATABASE_ID'),
    PROFILE_PAGE_ID: requireEnv('PROFILE_PAGE_ID'),

    JSEARCH_API_KEY: process.env.JSEARCH_API_KEY || '',
    ADZUNA_APP_ID: process.env.ADZUNA_APP_ID || '',
    ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GOOGLE_ALERTS_FEED_URL: process.env.GOOGLE_ALERTS_FEED_URL || '',

    PORT: Number(process.env.PORT) || 8788,
    CRON_TIMEZONE: process.env.CRON_TIMEZONE || 'Asia/Kolkata',
  };
}
