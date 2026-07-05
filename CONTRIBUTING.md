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

- **Improve the fresher filter** — tune the keyword lists in `server/src/fresher.js`
  (e.g. more junior/senior signals, better experience-range parsing).
- **Add a new job source** — copy an adapter in `server/src/sources/`, normalize it to
  the same shape, and add it to `server/src/sources/index.js`.
- **UI polish** — components live in `client/src/components/`.
- **Save / bookmark jobs** — a "saved jobs" view using `localStorage` would be a great feature.

## Code style

- Match the style of the file you're editing.
- Keep the frontend dependency-light (icons are inline SVGs on purpose).
- Prefer clear names over cleverness — this is a learning project too.

Happy shipping! 🚀
