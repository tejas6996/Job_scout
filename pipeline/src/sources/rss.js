import Parser from 'rss-parser';
import { hashString } from '../util/http.js';

const parser = new Parser();

// Mirrors "RSS Google Alerts" (disabled by default in the workflow) -> "Normalize RSS".
// Stays a no-op until GOOGLE_ALERTS_FEED_URL is configured.
export async function fetchRssJobs(cfg) {
  if (!cfg.GOOGLE_ALERTS_FEED_URL) return [];

  let feed;
  try {
    feed = await parser.parseURL(cfg.GOOGLE_ALERTS_FEED_URL);
  } catch {
    return [];
  }

  return (feed.items || []).map((j) => {
    const idSource = j.link || j.title || '';
    return {
      job_id: `alert_${hashString(idSource)}`,
      title: j.title || '',
      company: '',
      location: '',
      description: j.contentSnippet || j.content || '',
      apply_link: j.link || '',
      source: 'Alert',
      posted_at: j.isoDate || j.pubDate || '',
      experience_text: '',
    };
  });
}
