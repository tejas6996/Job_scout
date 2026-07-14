import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompensation } from '../src/compensation.js';

test('LPA range: "₹4-6 LPA"', () => {
  const c = parseCompensation('₹4-6 LPA');
  assert.equal(c.salary_min_inr_annual, 400000);
  assert.equal(c.salary_max_inr_annual, 600000);
  assert.equal(c.compensation_disclosed, true);
  assert.equal(c.is_unpaid, false);
});

test('LPA single: "4.5 LPA"', () => {
  const c = parseCompensation('4.5 LPA');
  assert.equal(c.salary_min_inr_annual, 450000);
  assert.equal(c.salary_max_inr_annual, 450000);
});

test('CTC with Indian comma grouping: "CTC 5,50,000"', () => {
  const c = parseCompensation('CTC 5,50,000');
  assert.equal(c.salary_min_inr_annual, 550000);
  assert.equal(c.salary_max_inr_annual, 550000);
});

test('rupee figure + "per annum": "₹6,00,000 per annum"', () => {
  const c = parseCompensation('₹6,00,000 per annum');
  assert.equal(c.salary_min_inr_annual, 600000);
});

test('lakh notation range: "3-5 lakh"', () => {
  const c = parseCompensation('3-5 lakh');
  assert.equal(c.salary_min_inr_annual, 300000);
  assert.equal(c.salary_max_inr_annual, 500000);
});

test('lakh notation single: "8 lakhs"', () => {
  const c = parseCompensation('8 lakhs');
  assert.equal(c.salary_min_inr_annual, 800000);
});

test('crore notation: "1.2 crore"', () => {
  const c = parseCompensation('1.2 crore');
  assert.equal(c.salary_min_inr_annual, 12000000);
});

test('monthly stipend: "₹15,000/month"', () => {
  const c = parseCompensation('₹15,000/month');
  assert.equal(c.stipend_inr_monthly, 15000);
  assert.equal(c.salary_min_inr_annual, null);
  assert.equal(c.compensation_disclosed, true);
});

test('monthly stipend with k-suffix: "₹25k per month"', () => {
  const c = parseCompensation('₹25k per month');
  assert.equal(c.stipend_inr_monthly, 25000);
});

test('unpaid stipend: "Unpaid"', () => {
  const c = parseCompensation('Unpaid');
  assert.equal(c.is_unpaid, true);
  assert.equal(c.stipend_inr_monthly, 0);
  assert.equal(c.compensation_disclosed, true);
});

test('performance-based stipend: no crash, marked not disclosed', () => {
  const c = parseCompensation('Performance-based');
  assert.equal(c.compensation_disclosed, false);
  assert.equal(c.is_unpaid, false);
  assert.equal(c.salary_min_inr_annual, null);
});

test('"Not Disclosed" never crashes and marks compensation_disclosed false', () => {
  for (const text of ['Not Disclosed', 'Salary undisclosed', 'Compensation not specified', '']) {
    const c = parseCompensation(text);
    assert.equal(c.compensation_disclosed, false);
    assert.equal(c.salary_min_inr_annual, null);
  }
});

test('never throws on garbage input', () => {
  assert.doesNotThrow(() => parseCompensation(undefined));
  assert.doesNotThrow(() => parseCompensation(null));
  assert.doesNotThrow(() => parseCompensation(12345));
  assert.doesNotThrow(() => parseCompensation('asdkjaslkdj random text with no numbers'));
});
