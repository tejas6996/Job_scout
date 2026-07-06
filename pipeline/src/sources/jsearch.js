import { safeJson } from '../util/http.js';

// Mirrors "HTTP JSearch" -> "Normalize JSearch".
export async function fetchJSearchJobs(cfg) {
  if (!cfg.JSEARCH_API_KEY) return [];

  const query = `${cfg.ROLE_KEYWORDS.split(',').slice(0, 3).join(' OR ')} jobs in ${cfg.LOCATION}`;
  const params = new URLSearchParams({
    query,
    country: cfg.COUNTRY,
    date_posted: 'week',
    page: '1',
    num_pages: String(cfg.JSEARCH_NUM_PAGES),
  });

  const { body } = await safeJson(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    headers: {
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': cfg.JSEARCH_API_KEY,
    },
  });

  const jobs = body?.data?.jobs || [];
  return jobs.map((j) => {
    const directLink = j.apply_options?.[0]?.apply_link || j.job_apply_link;
    const months = j.job_required_experience?.required_experience_in_months;
    return {
      job_id: j.job_id,
      title: j.job_title,
      company: j.employer_name,
      location: j.job_city || '',
      description: (j.job_description || '').slice(0, 6000),
      apply_link: directLink,
      source: 'JSearch',
      posted_at: j.job_posted_at_datetime_utc,
      experience_text: months != null ? `${months} months` : '',
    };
  });
}
