import { CompassIcon, SunIcon, MoonIcon, GithubIcon, RefreshIcon } from './icons.jsx';

const REPO_URL = 'https://github.com/tejas6996/Job_scout';

export default function Header({ theme, onToggleTheme, onRefresh, refreshing }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <CompassIcon width={20} height={20} />
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight">JobScout</h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Entry-level jobs for freshers</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <IconButton label="Refresh jobs" onClick={onRefresh}>
            <RefreshIcon className={refreshing ? 'animate-spin' : ''} />
          </IconButton>
          <IconButton label="Toggle theme" onClick={onToggleTheme}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <GithubIcon />
          </a>
        </div>
      </div>
    </header>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
