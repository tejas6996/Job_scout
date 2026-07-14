// Pulls an application deadline out of a posting's text, when the source
// states one explicitly — common on internship listings ("Apply by 20 Aug
// 2026", "Last date to apply: 31/07/2026"). Returns an ISO date string or
// null; never throws on unparseable text.

const DEADLINE_PATTERNS = [
  /(?:apply\s+by|application\s+deadline|last\s+date\s+to\s+apply|closes?\s+on)[:\s]+([0-9]{1,2}[\s/-][a-zA-Z0-9]{2,9}[\s/-][0-9]{2,4})/i,
];

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseLoose(dateStr) {
  const isoLike = new Date(dateStr);
  if (!Number.isNaN(isoLike.getTime())) return isoLike;

  // DD-MM-YYYY or DD/MM/YYYY
  const numeric = dateStr.match(/^(\d{1,2})[\s/-](\d{1,2})[\s/-](\d{2,4})$/);
  if (numeric) {
    const [, d, m, y] = numeric;
    const year = y.length === 2 ? Number(`20${y}`) : Number(y);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  // "20 Aug 2026" / "20-Aug-2026"
  const worded = dateStr.match(/^(\d{1,2})[\s/-]([a-zA-Z]{3,9})[\s/-](\d{2,4})$/);
  if (worded) {
    const [, d, monthName, y] = worded;
    const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const year = y.length === 2 ? Number(`20${y}`) : Number(y);
      const date = new Date(Date.UTC(year, month, Number(d)));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

export function extractApplyDeadline(text = '') {
  const raw = String(text || '');
  for (const pattern of DEADLINE_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const parsed = parseLoose(match[1].trim());
      if (parsed) return parsed.toISOString();
    }
  }
  return null;
}
