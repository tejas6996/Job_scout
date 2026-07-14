# Contributing to JobScout

Welcome, **Tejas** and **Soorya** 👋 — this guide keeps our shared work on `main`
clean and conflict-free.

## Golden rules

1. **Never push directly to `main`.** Always work on a feature branch and open a PR.
2. **Pull before you start.** `git checkout main && git pull` so you branch from the latest.
3. **Small, focused commits** with clear messages.
4. **Never commit `.env`, `node_modules`, or `client/dist`** — they're git-ignored for a reason.

## Day-to-day workflow

```bash
# start from an up-to-date main
git checkout main
git pull

# create a branch for your task
git checkout -b feature/short-description

# ... make your changes, then ...
git add .
git commit -m "Describe what you changed"
git push -u origin feature/short-description
```

Then open a **Pull Request** on GitHub and ask the other person to review. Merge once
it's approved and the app still runs.

## Running the app

```bash
npm install     # first time only (installs client + server)
npm run dev      # API on :8787, dashboard on :5173 -> open http://localhost:5173
```

## Good first tasks

- **Improve the fresher filter** — tune the keyword lists in `config/india.yaml`, or the
  regex rules in `server/src/filters/stageA.js` (better experience-range parsing, more
  junior/senior signals).
- **Add a new job source** — see "Adding a new source" in the README: one adapter file in
  `server/src/sources/`, registered in `server/src/sources/index.js` and toggled on in
  `config/india.yaml`. Naukri/Internshala/Unstop/etc. need a scraping-based adapter — see
  MIGRATION.md for context on why those aren't implemented yet.
- **UI polish** — components live in `client/src/components/`.
- **Save / bookmark jobs** — a "saved jobs" view using `localStorage` would be a great feature.

## Code style

- Match the style of the file you're editing.
- Keep the frontend dependency-light (icons are inline SVGs on purpose).
- Prefer clear names over cleverness — this is a learning project too.

Happy shipping! 🚀
