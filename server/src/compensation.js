// Parses Indian compensation phrasing out of job titles/descriptions into
// canonical numeric fields. Indian listings mix LPA/lakh/crore notation,
// Indian-style comma grouping (5,50,000), monthly stipends, and a lot of
// "Not Disclosed" — this must never throw on any of it.

const LAKH = 100000;
const CRORE = 10000000;

const NOT_DISCLOSED = /\b(not\s+disclosed|undisclosed|not\s+specified|not\s+mentioned)\b/i;
const UNPAID = /\bunpaid\b/i;

const STIPEND_SINGLE =
  /₹?\s*rs\.?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:\/|per\s+)\s*month\b|₹?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:\/|per\s+)\s*month\b|₹?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:\/-?\s*)?pm\b/i;

const LPA_RANGE = /₹?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*lpa\b/i;
const LPA_SINGLE = /₹?\s*(\d+(?:\.\d+)?)\s*lpa\b/i;

const LAKH_RANGE = /₹?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*lakh(?:s)?\b/i;
const LAKH_SINGLE = /₹?\s*(\d+(?:\.\d+)?)\s*lakh(?:s)?\b/i;

const CRORE_RANGE = /₹?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*crore(?:s)?\b/i;
const CRORE_SINGLE = /₹?\s*(\d+(?:\.\d+)?)\s*crore(?:s)?\b/i;

// Only matched when the text also signals "this is an annual CTC figure"
// (ctc / per annum / p.a.), so a random 5-digit number in a description
// never gets misread as a salary.
const ANNUAL_CTC_CONTEXT = /\bctc\b|\bper\s+annum\b|\bp\.?a\.?\b/i;
const ANNUAL_RUPEE_FIGURE = /₹?\s*((?:\d{1,2},)?\d{2},\d{3}|\d{5,8})(?!\s*(?:k\b|lpa|lakh|crore))/i;

function toNumber(numStr) {
  return parseFloat(String(numStr).replace(/,/g, ''));
}

function applyK(value, kFlag) {
  return kFlag ? value * 1000 : value;
}

const NULL_COMP = () => ({
  salary_min_inr_annual: null,
  salary_max_inr_annual: null,
  stipend_inr_monthly: null,
  is_unpaid: false,
  compensation_disclosed: false,
});

export function parseCompensation(text = '') {
  const raw = String(text || '');
  if (!raw.trim()) return NULL_COMP();

  if (NOT_DISCLOSED.test(raw)) return NULL_COMP();

  if (UNPAID.test(raw)) {
    return {
      salary_min_inr_annual: null,
      salary_max_inr_annual: null,
      stipend_inr_monthly: 0,
      is_unpaid: true,
      compensation_disclosed: true,
    };
  }

  const stipendMatch = raw.match(STIPEND_SINGLE);
  if (stipendMatch) {
    const numStr = stipendMatch[1] || stipendMatch[3] || stipendMatch[5];
    const kFlag = Boolean(stipendMatch[2] || stipendMatch[4] || stipendMatch[6]);
    const monthly = applyK(toNumber(numStr), kFlag);
    if (Number.isFinite(monthly)) {
      return {
        salary_min_inr_annual: null,
        salary_max_inr_annual: null,
        stipend_inr_monthly: monthly,
        is_unpaid: false,
        compensation_disclosed: true,
      };
    }
  }

  const lpaRange = raw.match(LPA_RANGE);
  if (lpaRange) return annualRange(toNumber(lpaRange[1]) * LAKH, toNumber(lpaRange[2]) * LAKH);

  const lpaSingle = raw.match(LPA_SINGLE);
  if (lpaSingle) return annualSingle(toNumber(lpaSingle[1]) * LAKH);

  const lakhRange = raw.match(LAKH_RANGE);
  if (lakhRange) return annualRange(toNumber(lakhRange[1]) * LAKH, toNumber(lakhRange[2]) * LAKH);

  const lakhSingle = raw.match(LAKH_SINGLE);
  if (lakhSingle) return annualSingle(toNumber(lakhSingle[1]) * LAKH);

  const croreRange = raw.match(CRORE_RANGE);
  if (croreRange) return annualRange(toNumber(croreRange[1]) * CRORE, toNumber(croreRange[2]) * CRORE);

  const croreSingle = raw.match(CRORE_SINGLE);
  if (croreSingle) return annualSingle(toNumber(croreSingle[1]) * CRORE);

  if (ANNUAL_CTC_CONTEXT.test(raw)) {
    const figure = raw.match(ANNUAL_RUPEE_FIGURE);
    if (figure) {
      const amount = toNumber(figure[1]);
      if (Number.isFinite(amount) && amount >= 10000) return annualSingle(amount);
    }
  }

  return NULL_COMP();
}

function annualSingle(amount) {
  return {
    salary_min_inr_annual: amount,
    salary_max_inr_annual: amount,
    stipend_inr_monthly: null,
    is_unpaid: false,
    compensation_disclosed: true,
  };
}

function annualRange(min, max) {
  return {
    salary_min_inr_annual: Math.min(min, max),
    salary_max_inr_annual: Math.max(min, max),
    stipend_inr_monthly: null,
    is_unpaid: false,
    compensation_disclosed: true,
  };
}
