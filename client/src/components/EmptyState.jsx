import { SearchIcon } from './icons.jsx';

export default function EmptyState({ error, onReset }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        <SearchIcon width={22} height={22} />
      </span>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {error ? 'Could not load jobs' : 'No matching roles found'}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-zinc-500 dark:text-zinc-400">
        {error
          ? error
          : 'Try broadening your search, switching source, or including non-English postings.'}
      </p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-indigo-500 dark:hover:text-white"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}
