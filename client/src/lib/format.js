export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Deterministic pleasant background color for a company monogram.
export function colorFromString(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 45%)`;
}

function formatLakh(amount) {
  const lakhs = amount / 100000;
  const rounded = Number.isInteger(lakhs) ? lakhs : Math.round(lakhs * 10) / 10;
  return `${rounded} LPA`;
}

// Renders a job's parsed compensation (see server/src/compensation.js) as a
// short, India-idiomatic label — LPA for annual CTC, per-month for
// internship stipends. Returns '' when there's nothing to show.
export function formatCompensation(comp) {
  if (!comp) return '';
  if (comp.is_unpaid) return 'Unpaid';
  if (!comp.compensation_disclosed) return '';
  if (comp.stipend_inr_monthly != null) {
    return `₹${comp.stipend_inr_monthly.toLocaleString('en-IN')}/month`;
  }
  if (comp.salary_min_inr_annual != null && comp.salary_max_inr_annual != null) {
    if (comp.salary_min_inr_annual === comp.salary_max_inr_annual) {
      return formatLakh(comp.salary_min_inr_annual);
    }
    return `${formatLakh(comp.salary_min_inr_annual)} – ${formatLakh(comp.salary_max_inr_annual)}`;
  }
  return '';
}

export function formatDeadline(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return '';
  if (daysLeft === 0) return 'Apply today';
  if (daysLeft <= 7) return `Apply by ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} (${daysLeft}d left)`;
  return `Apply by ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}
