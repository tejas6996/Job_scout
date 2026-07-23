import { relativeTime, initials, colorFromString, formatCompensation, formatDeadline } from '../lib/format.js';
import { MapPinIcon, ClockIcon, ExternalLinkIcon, ShieldCheckIcon, AlertTriangleIcon, ChevronDownIcon } from './icons.jsx';

const ROLE_TYPE_BADGE = {
  internship: { label: 'Internship', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  apprenticeship: { label: 'Apprenticeship', className: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  trainee: { label: 'Trainee / GET', className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  full_time_entry: { label: 'Entry level', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

export default function JobCard({ job }) {
  const badge = ROLE_TYPE_BADGE[job.fresher?.role_type] || { label: 'Fresher-friendly', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' };
  const tags = (job.tags || []).filter(Boolean).slice(0, 3);
  const compensationLabel = formatCompensation(job.compensation);
  const deadlineLabel = formatDeadline(job.applyBy);
  const hasAiMatch = job.matchScore != null || (job.keySkills || []).length > 0 || (job.resumeBullets || []).length > 0;

  return (
    <article className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-hover dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      {job.scamFlag && (
        <div
          className="mb-3 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          title={job.scamReason || 'Flagged by AI screening — review carefully before applying.'}
        >
          <AlertTriangleIcon width={14} height={14} className="mt-0.5 shrink-0" />
          <span>Review before applying{job.scamReason ? ` — ${job.scamReason}` : ''}</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <Logo job={job} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50" title={job.title}>
            {job.title}
          </h3>
          <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{job.company}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {job.status === 'unclear' && (
            <span
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
              title="Our filters couldn't confidently classify this one — take a look yourself."
            >
              Unclear
            </span>
          )}
        </div>
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

      {(compensationLabel || deadlineLabel) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          {compensationLabel && (
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{compensationLabel}</span>
          )}
          {deadlineLabel && (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {deadlineLabel}
            </span>
          )}
        </div>
      )}

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

      {hasAiMatch && (
        <details className="group/match mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-indigo-600 dark:text-indigo-400">
            <ChevronDownIcon width={13} height={13} className="transition group-open/match:rotate-180" />
            AI match{job.matchScore != null ? ` — ${job.matchScore}/100` : ''}
          </summary>
          <div className="mt-2 space-y-2 rounded-lg bg-zinc-50 p-2.5 text-[12px] dark:bg-zinc-800/60">
            {(job.keySkills || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {job.keySkills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
            {(job.resumeBullets || []).length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Resume bullet drafts — review before use
                </p>
                <ul className="list-disc space-y-1 pl-4 text-zinc-600 dark:text-zinc-300">
                  {job.resumeBullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {job.source}
          {job.verified && (
            <ShieldCheckIcon width={13} height={13} className="text-emerald-500" title="Apply link verified reachable" />
          )}
        </span>
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
