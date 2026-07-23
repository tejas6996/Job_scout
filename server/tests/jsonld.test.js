import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJobPostings } from '../src/util/jsonld.js';

function page(scriptBody) {
  return `<html><head><script type="application/ld+json">${scriptBody}</script></head><body></body></html>`;
}

test('extracts a single top-level JobPosting object', () => {
  const html = page(JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: 'Data Analyst Intern',
    datePosted: '2026-07-15',
  }));
  const postings = extractJobPostings(html);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].title, 'Data Analyst Intern');
});

test('extracts multiple postings from a top-level array', () => {
  const html = page(JSON.stringify([
    { '@type': 'JobPosting', title: 'Data Analyst Intern' },
    { '@type': 'JobPosting', title: 'Data Engineer Apprentice' },
  ]));
  const postings = extractJobPostings(html);
  assert.equal(postings.length, 2);
  assert.deepEqual(postings.map((p) => p.title), ['Data Analyst Intern', 'Data Engineer Apprentice']);
});

test('extracts postings nested inside an @graph alongside other schema types', () => {
  const html = page(JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'Acme' },
      { '@type': 'JobPosting', title: 'Data Analyst Intern' },
      { '@type': 'BreadcrumbList', itemListElement: [] },
    ],
  }));
  const postings = extractJobPostings(html);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].title, 'Data Analyst Intern');
});

test('handles @type as an array containing JobPosting', () => {
  const html = page(JSON.stringify({ '@type': ['JobPosting'], title: 'Data Engineer Intern' }));
  const postings = extractJobPostings(html);
  assert.equal(postings.length, 1);
});

test('a malformed JSON-LD block is skipped, not fatal', () => {
  const html = `
    <script type="application/ld+json">{ this is not valid json </script>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Data Analyst Intern' })}</script>
  `;
  const postings = extractJobPostings(html);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].title, 'Data Analyst Intern');
});

test('a page with no JobPosting JSON-LD returns an empty array, not an error', () => {
  const html = page(JSON.stringify({ '@type': 'Organization', name: 'Acme' }));
  const postings = extractJobPostings(html);
  assert.deepEqual(postings, []);
});

test('a page with no JSON-LD at all returns an empty array', () => {
  const postings = extractJobPostings('<html><body><h1>Careers</h1></body></html>');
  assert.deepEqual(postings, []);
});

test('multiple separate script blocks on one page are all scanned', () => {
  const html = `
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Acme' })}</script>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Data Analyst Intern' })}</script>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Data Engineer Apprentice' })}</script>
  `;
  const postings = extractJobPostings(html);
  assert.equal(postings.length, 2);
});
