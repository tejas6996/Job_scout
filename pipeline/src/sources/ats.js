import { safeJson } from '../util/http.js';

// Mirrors "Build ATS Company List" -> "HTTP ATS Jobs" -> "Normalize ATS".
export async function fetchAtsJobs(cfg) {
  const companies = cfg.ATS_COMPANIES;
  if (!companies.length) return [];

  const results = await Promise.all(
    companies.map(async (company) => {
      const url =
        company.type === 'greenhouse'
          ? `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`
          : `https://api.lever.co/v0/postings/${company.token}?mode=json`;
      const { body } = await safeJson(url);
      return { company, body };
    }),
  );

  const out = [];
  for (const { company, body } of results) {
    if (company.type === 'lever') {
      const list = Array.isArray(body) ? body : [];
      for (const j of list) {
        out.push({
          job_id: `lv_${j.id}`,
          title: j.text,
          company: company.token,
          location: j.categories?.location || '',
          description: (j.descriptionPlain || '').slice(0, 6000),
          apply_link: j.hostedUrl,
          source: 'Lever',
          posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : '',
          experience_text: '',
        });
      }
    } else {
      const jobs = body?.jobs || [];
      for (const j of jobs) {
        out.push({
          job_id: `gh_${j.id}`,
          title: j.title,
          company: j.company?.name || company.token,
          location: j.location?.name || '',
          description: (j.content || '').replace(/<[^>]+>/g, ' ').slice(0, 6000),
          apply_link: j.absolute_url,
          source: 'Greenhouse',
          posted_at: j.updated_at,
          experience_text: '',
        });
      }
    }
  }
  return out;
}
