import { SearchIcon } from './icons.jsx';

const SELECT_CLASS =
  'h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200';

// No location dropdown right now: config/india.yaml's locations.scope is
// currently just [bengaluru], so every result already is Bengaluru — a
// selector with one meaningful option isn't worth showing. If scope is
// widened later (server/src/location.js -> scopedLocations()), reintroduce
// a Select here fed from GET /api/meta's `locations` field instead of a
// hardcoded list, so it can't drift out of sync with the server's scope.

const SOURCE_OPTIONS = [
  ['', 'All sources'],
  ['jobicy', 'Jobicy'],
  ['remotive', 'Remotive'],
  ['adzuna', 'Adzuna'],
  ['jsearch', 'JSearch'],
  ['ats_boards', 'Company boards'],
];

export default function Controls({ filters, onChange, onReset, hasActiveFilters }) {
  return (
    <section className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChange('q', e.target.value)}
          placeholder="Search roles, companies, skills…"
          aria-label="Search jobs"
          className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Role type"
          value={filters.level}
          onChange={(v) => onChange('level', v)}
          options={[
            ['all', 'All role types'],
            ['internship', 'Internship'],
            ['apprenticeship', 'Apprenticeship'],
            ['trainee', 'Trainee / GET'],
            ['full_time_entry', 'Full-time (entry)'],
          ]}
        />
        <Select
          label="Source"
          value={filters.source}
          onChange={(v) => onChange('source', v)}
          options={SOURCE_OPTIONS}
        />
        <Select
          label="Sort"
          value={filters.sort}
          onChange={(v) => onChange('sort', v)}
          options={[
            ['relevant', 'Best match'],
            ['recent', 'Most recent'],
            ['deadline', 'Deadline soonest'],
          ]}
        />

        <Toggle active={filters.remote} onClick={() => onChange('remote', !filters.remote)}>
          Remote only
        </Toggle>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Reset
          </button>
        )}
      </div>
    </section>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={SELECT_CLASS}
      >
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ active, onClick, children, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium shadow-sm transition ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-indigo-300'
          : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
