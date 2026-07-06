import { safeJson } from '../util/http.js';

// Mirrors "HTTP Adzuna" -> "Normalize Adzuna". Paginates across ADZUNA_PAGES
// pages of RESULTS_PER_SOURCE each (Adzuna's free-tier daily call budget is
// generous, unlike JSearch's fixed total-request quota).
export async function fetchAdzunaJobs(cfg) {
  if (!cfg.ADZUNA_APP_ID || !cfg.ADZUNA_APP_KEY) return [];

  const pages = await Promise.all(
    Array.from({ length: cfg.ADZUNA_PAGES }, (_, i) => i + 1).map(async (page) => {
      const params = new URLSearchParams({
        app_id: cfg.ADZUNA_APP_ID,
        app_key: cfg.ADZUNA_APP_KEY,
        what_or: cfg.ROLE_KEYWORDS.split(',').join(' '),
        where: cfg.LOCATION,
        max_days_old: String(cfg.MAX_DAYS),
        results_per_page: String(cfg.RESULTS_PER_SOURCE),
        sort_by: 'date',
        'content-type': 'application/json',
      });
      const { body } = await safeJson(
        `https://api.adzuna.com/v1/api/jobs/${cfg.COUNTRY}/search/${page}?${params}`,
      );
      return body?.results || [];
    }),
  );

  return pages.flat().map((j) => ({
    job_id: String(j.id),
    title: j.title,
    company: j.company?.display_name || '',
    location: j.location?.display_name || '',
    description: (j.description || '').slice(0, 6000),
    apply_link: j.redirect_url,
    source: 'Adzuna',
    posted_at: j.created,
    experience_text: '',
  }));
}
