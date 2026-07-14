import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Controls from './components/Controls.jsx';
import StatsBar from './components/StatsBar.jsx';
import JobList from './components/JobList.jsx';
import EmptyState from './components/EmptyState.jsx';
import Pagination from './components/Pagination.jsx';
import { fetchJobs } from './lib/api.js';

const DEFAULT_FILTERS = {
  q: '',
  level: 'all',
  location: 'all',
  source: '',
  sort: 'relevant',
  remote: false,
};

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem('jobscout-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ jobs: [], total: 0, pages: 1, sources: [], updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0); // bump to force a refetch (Refresh button)

  // ---- Theme ----
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('jobscout-theme', theme);
  }, [theme]);

  // ---- Auto-refresh: the server re-polls sources every ~15 min in the
  // background (server/src/pool.js), so re-fetching from here every 5 min
  // is enough to reflect that promptly without hammering our own API. ----
  useEffect(() => {
    const AUTO_REFRESH_MS = 5 * 60 * 1000;
    const interval = setInterval(() => setNonce((n) => n + 1), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // ---- Debounce the search box ----
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  // ---- Reset to page 1 whenever a filter changes ----
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filters.level, filters.location, filters.source, filters.sort, filters.remote]);

  // ---- Fetch jobs ----
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchJobs(
      {
        q: debouncedQ,
        level: filters.level,
        location: filters.location,
        source: filters.source,
        sort: filters.sort,
        remote: filters.remote ? 'true' : '',
        page,
        limit: 24,
      },
      controller.signal,
    )
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Something went wrong');
        setData((d) => ({ ...d, jobs: [], total: 0, pages: 1 }));
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQ, filters.level, filters.location, filters.source, filters.sort, filters.remote, page, nonce]);

  const updateFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const hasActiveFilters = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS),
    [filters],
  );

  const showEmpty = !loading && data.jobs.length === 0;

  return (
    <div className="min-h-screen">
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onRefresh={() => setNonce((n) => n + 1)}
        refreshing={loading}
      />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <section className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Find your first role in India, faster.
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Curated internships, trainee programs and entry-level jobs (0–2 years) across Bengaluru,
            Hyderabad, Remote-India and more — filtered to skip senior-only postings.
          </p>
        </section>

        <div className="space-y-4">
          <Controls
            filters={filters}
            onChange={updateFilter}
            onReset={resetFilters}
            hasActiveFilters={hasActiveFilters}
          />
          <StatsBar
            total={data.total}
            sources={data.sources}
            updatedAt={data.updatedAt}
            loading={loading}
          />
        </div>

        <div className="mt-6 space-y-6">
          {showEmpty ? (
            <EmptyState error={error} onReset={hasActiveFilters ? resetFilters : null} />
          ) : (
            <>
              <JobList jobs={data.jobs} loading={loading} />
              {!loading && <Pagination page={data.page || page} pages={data.pages} onPage={setPage} />}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        JobScout · India-only, freshers-only · aggregated from Adzuna, JSearch, company boards &amp; more
      </footer>
    </div>
  );
}
