// Extracts schema.org JobPosting objects from a page's embedded JSON-LD
// (<script type="application/ld+json">) — the structured data most modern
// career sites publish so Google for Jobs can index them. This is the same
// data Googlebot reads, not arbitrary HTML scraping.
//
// Handles the shapes actually seen in the wild: a single JobPosting object,
// a top-level array of postings, and postings nested inside an @graph array
// alongside other schema types (Organization, BreadcrumbList, ...). Never
// throws on malformed/unexpected JSON — a broken block is skipped, not
// fatal to the rest of the page.
const SCRIPT_BLOCK = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isJobPostingType(type) {
  if (!type) return false;
  return Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
}

function collectPostings(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectPostings(item, out);
    return;
  }
  if (isJobPostingType(node['@type'])) out.push(node);
  if (Array.isArray(node['@graph'])) {
    for (const item of node['@graph']) collectPostings(item, out);
  }
}

export function extractJobPostings(html) {
  const postings = [];
  const text = String(html || '');
  SCRIPT_BLOCK.lastIndex = 0;
  let match;
  while ((match = SCRIPT_BLOCK.exec(text))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      collectPostings(parsed, postings);
    } catch {
      // malformed JSON-LD block — skip it, never crash the page fetch
    }
  }
  return postings;
}
