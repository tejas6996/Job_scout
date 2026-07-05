import { relativeTime } from '../lib/format.js';

export default function StatsBar({ total, sources, updatedAt, loading }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
      <span>
        <strong className="font-semibold text-zinc-700 dark:text-zinc-200">{loading ? '—' : total}</strong>{' '}
        fresher-friendly {total === 1 ? 'role' : 'roles'}
      </span>

      {Array.isArray(sources) && sources.length > 0 && (
        <span className="flex items-center gap-2">
          {sources.map((s) => (
            <span
              key={s.source}
              title={s.ok ? `${s.count} fetched` : s.error || 'unavailable'}
              className="inline-flex items-center gap-1"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-red-400'}`} />
              {s.source}
            </span>
          ))}
        </span>
      )}

      {updatedAt && <span className="ml-auto">updated {relativeTime(updatedAt)}</span>}
    </div>
  );
}
