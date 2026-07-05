import { relativeTime, initials, colorFromString } from '../lib/format.js';
import { MapPinIcon, ClockIcon, ExternalLinkIcon } from './icons.jsx';

const LEVEL_BADGE = {
  internship: { label: 'Internship', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  entry: { label: 'Entry level', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  junior: { label: '≤ 3 yrs exp', className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  open: { label: 'Open to freshers', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
};

export default function JobCard({ job }) {
  const badge = LEVEL_BADGE[job.fresher?.level] || LEVEL_BADGE.open;
  const tags = (job.tags || []).filter(Boolean).slice(0, 3);

  return (
    <article className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-hover dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start gap-3">
        <Logo job={job} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50" title={job.title}>
            {job.title}
          </h3>
          <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{job.company}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <MapPinIcon width={13} height={13} />
          <span className="max-w-[160px] truncate">{job.location || 'Remote'}</span>
        </span>
        {job.remote && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            Remote
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <ClockIcon width={13} height={13} />
          {relativeTime(job.postedAt)}
        </span>
      </div>

      {job.excerpt && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          {job.excerpt}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{job.source}</span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-indigo-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-indigo-500 dark:hover:text-white"
        >
          View &amp; apply
          <ExternalLinkIcon width={14} height={14} />
        </a>
      </div>
    </article>
  );
}

function Logo({ job }) {
  if (job.companyLogo) {
    return (
      <img
        src={job.companyLogo}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
        className="h-10 w-10 shrink-0 rounded-lg border border-zinc-200 bg-white object-contain p-1 dark:border-zinc-700"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
      style={{ backgroundColor: colorFromString(job.company || job.source) }}
    >
      {initials(job.company)}
    </span>
  );
}
