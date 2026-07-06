// Thin wrapper around the Notion REST API — replaces the "Get Notion Profile
// Blocks", "Get Existing Job IDs" and "Create Notion Page" nodes.

const NOTION_VERSION = '2022-06-28';
const API = 'https://api.notion.com/v1';

function headers(cfg) {
  return {
    Authorization: `Bearer ${cfg.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionFetch(cfg, path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: headers(cfg) });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API ${path} failed: ${res.status} ${body?.message || ''}`);
  }
  return body;
}

function blockPlainText(block) {
  const richText = block?.[block.type]?.rich_text;
  if (!Array.isArray(richText)) return '';
  return richText.map((r) => r.plain_text || '').join('');
}

// Mirrors "Get Notion Profile Blocks" -> "Extract Profile Text": read every
// child block of the profile page, concatenate their text, one line each.
export async function getProfileText(cfg) {
  const lines = [];
  let cursor;
  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);
    const page = await notionFetch(cfg, `/blocks/${cfg.PROFILE_PAGE_ID}/children?${params}`);
    for (const block of page.results || []) {
      const text = blockPlainText(block);
      if (text) lines.push(text);
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  return lines.join('\n') || 'PROFILE PAGE EMPTY - fill in My Profile in Notion.';
}

function richTextPlainText(property) {
  if (!property || !Array.isArray(property.rich_text)) return '';
  return property.rich_text.map((r) => r.plain_text || '').join('');
}

// Mirrors "Get Existing Job IDs": every page already in the database, keyed
// by its "Job ID" rich_text property, so we can skip duplicates later.
export async function getExistingJobIds(cfg) {
  const ids = new Set();
  let cursor;
  do {
    const body = await notionFetch(cfg, `/databases/${cfg.NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const page of body.results || []) {
      const jobId = richTextPlainText(page.properties?.['Job ID']);
      if (jobId) ids.add(jobId);
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return ids;
}

let cachedTitleProperty;

// The database's title property can be named anything ("Name", "Title", ...).
// n8n's Notion node resolves this for you; here we look it up once and cache it.
async function getTitlePropertyName(cfg) {
  if (cachedTitleProperty) return cachedTitleProperty;
  const db = await notionFetch(cfg, `/databases/${cfg.NOTION_DATABASE_ID}`);
  const entry = Object.entries(db.properties || {}).find(([, v]) => v.type === 'title');
  cachedTitleProperty = entry ? entry[0] : 'Name';
  return cachedTitleProperty;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
}

// Mirrors "Create Notion Page": one page per scouted job, matching the
// property mapping from the workflow's propertiesUi (Key Skills was wired up
// to job.key_skills here — the source workflow left that mapping empty).
export async function createJobPage(job, cfg) {
  const titleProp = await getTitlePropertyName(cfg);
  const today = new Date().toISOString().slice(0, 10);

  const properties = {
    [titleProp]: { title: [{ text: { content: job.title || '' } }] },
    Company: { rich_text: [{ text: { content: job.company || '' } }] },
    Location: { rich_text: [{ text: { content: job.location || '' } }] },
    'Apply Link': { url: job.apply_link || null },
    Source: { select: { name: job.source } },
    'Posted Date': { date: { start: dateOnly(job.posted_at) } },
    'Experience Req': { rich_text: [{ text: { content: job.experience_text || '' } }] },
    'Match Score': { number: typeof job.match_score === 'number' ? job.match_score : null },
    'Key Skills': { multi_select: (job.key_skills || []).map((name) => ({ name })) },
    'Resume Bullets': { rich_text: [{ text: { content: (job.resume_bullets || []).join('\n') } }] },
    Status: { select: { name: job.scam_flag ? 'Unclear' : job.status } },
    Verified: { checkbox: !!job.verified },
    'Job ID': { rich_text: [{ text: { content: job.job_id || '' } }] },
    'Scraped At': { date: { start: today } },
  };

  return notionFetch(cfg, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: cfg.NOTION_DATABASE_ID },
      properties,
    }),
  });
}
