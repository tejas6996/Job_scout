import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeLocation } from '../src/location.js';

const CASES = [
  ['Bengaluru', 'bengaluru'],
  ['Bangalore', 'bengaluru'],
  ['Blr', 'bengaluru'],
  ['Bangalore Urban', 'bengaluru'],
  ['Gurugram', 'gurugram'],
  ['Gurgaon', 'gurugram'],
  ['Delhi', 'delhi_ncr'],
  ['New Delhi', 'delhi_ncr'],
  ['NCR', 'delhi_ncr'],
  ['Delhi NCR', 'delhi_ncr'],
  ['Mumbai', 'mumbai'],
  ['Bombay', 'mumbai'],
  ['Hyderabad', 'hyderabad'],
  ['Secunderabad', 'hyderabad'],
  ['Pune', 'pune'],
  ['Chennai', 'chennai'],
  ['Madras', 'chennai'],
  ['Noida', 'noida'],
  ['Greater Noida', 'noida'],
  ['Kolkata', 'kolkata'],
  ['Calcutta', 'kolkata'],
  ['Ahmedabad', 'ahmedabad'],
  ['Coimbatore', 'coimbatore'],
  ['Remote India', 'remote_india'],
  ['Remote - India', 'remote_india'],
  ['Hybrid', 'hybrid'],
];

for (const [input, expected] of CASES) {
  test(`"${input}" -> ${expected}`, () => {
    assert.equal(canonicalizeLocation(input), expected);
  });
}

test('case-insensitive and embedded in a longer string', () => {
  assert.equal(canonicalizeLocation('BANGALORE, Karnataka, India'), 'bengaluru');
  assert.equal(canonicalizeLocation('Gurugram, Haryana'), 'gurugram');
});

test('bare "Remote" with no India qualifier does not resolve to Remote-India', () => {
  assert.equal(canonicalizeLocation('Remote, Germany'), null);
});

test('unrecognized location returns null', () => {
  assert.equal(canonicalizeLocation('San Francisco, CA'), null);
  assert.equal(canonicalizeLocation(''), null);
  assert.equal(canonicalizeLocation(null), null);
});
