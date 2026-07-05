export default function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Pagination">
      <PageButton disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </PageButton>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Page <strong className="font-semibold text-zinc-700 dark:text-zinc-200">{page}</strong> of {pages}
      </span>
      <PageButton disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </PageButton>
    </nav>
  );
}

function PageButton({ disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition enabled:hover:border-zinc-300 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
