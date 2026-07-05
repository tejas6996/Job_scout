# 🧭 JobScout

A minimalist dashboard that curates **entry-level & early-career jobs** for freshers —
people with roughly **under 3 years of experience**. It pulls postings from several
free, keyless job APIs, filters out senior-only roles, and presents what's left in a
clean, fast, distraction-free UI.

> Built to make the fresher job hunt a little less painful.

---

## ✨ Features

- **Fresher-first filtering** — a heuristic reads each posting (title, tags, and
  description) and drops roles that clearly require senior experience (e.g. "5+ years",
  "Senior", "Lead", "Manager"). Internships, entry-level, and ≤ 3-year roles are kept
  and labelled.
- **Multiple free sources** — aggregates [Jobicy](https://jobicy.com),
  [Remotive](https://remotive.com), and [Arbeitnow](https://www.arbeitnow.com).
  **No API keys required.**
- **English by default** — non-English postings are hidden unless you toggle them on.
- **Fresh only** — postings older than 60 days are dropped so you don't apply to filled roles.
- **Search & filters** — search text, filter by source / experience band / remote, and
  sort by best match or most recent.
- **Minimalist UI** — light/dark mode, responsive card grid, loading skeletons.
- **Secure by design** — the browser only talks to our own backend, which adds security
  headers (helmet), rate limiting, input validation, and caching.

---

## 🧱 Tech stack

| Layer     | Tech                                               |
| --------- | -------------------------------------------------- |
| Frontend  | React 18 + Vite 6 + Tailwind CSS 3                  |
| Backend   | Node.js (18+) + Express 4                           |
| Security  | helmet, express-rate-limit, CORS allow-list        |
| Sources   | Jobicy, Remotive, Arbeitnow (free public JSON APIs) |

This is an **npm workspaces monorepo** — one install command sets up everything.

---

## 📁 Project structure

```
Job_scout/
├── client/                 # React + Vite + Tailwind dashboard
│   └── src/
│       ├── App.jsx         # State, data fetching, layout
│       ├── components/     # Header, Controls, JobCard, JobList, …
│       └── lib/            # API client + formatting helpers
├── server/                 # Express API (proxy + filtering + cache)
│   └── src/
│       ├── index.js        # App entry, security middleware
│       ├── routes/jobs.js  # /api/jobs, /api/meta
│       ├── fresher.js      # "under 3 years" heuristic
│       ├── pool.js         # In-memory cache of aggregated jobs
│       └── sources/        # One adapter per job board
├── package.json            # Workspaces + dev/build scripts
└── README.md
```

---

## 🚀 Getting started

### Prerequisites
- **Node.js 18 or newer** (this project was built on Node 20). Check with `node --version`.

### Install & run (one time)

```bash
# 1. Clone
git clone https://github.com/tejas6996/Job_scout.git
cd Job_scout

# 2. Install everything (client + server) in one go
npm install

# 3. Start the API and the dashboard together
npm run dev
```

Then open **http://localhost:5173** in your browser. That's it — no keys, no config.

> The dashboard (Vite, port 5173) proxies `/api` requests to the backend (Express,
> port 8787), so you only ever load one origin in the browser.

### Available scripts (run from the repo root)

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`        | Runs the API **and** dashboard together (recommended) |
| `npm run dev:server` | Runs only the backend API                             |
| `npm run dev:client` | Runs only the frontend                                |
| `npm run build`      | Builds the production dashboard into `client/dist`    |
| `npm start`          | Runs the API and serves the built dashboard (prod)    |

---

## 🎯 How the "fresher" filter works

Most job boards don't expose a clean "years required" field, so `server/src/fresher.js`
infers it:

1. **Hard-exclude** postings that clearly need seniority — a senior/lead/manager title,
   a source level of "Senior", or an experience requirement above 3 years — **unless**
   the posting also carries an explicit junior signal.
2. **Classify** everything that survives into a band: `Internship`, `Entry level`,
   `≤ 3 yrs`, or `Open to freshers` (no seniority barrier found), each with a
   confidence score used by the "Best match" sort.

It's a heuristic, so it won't be perfect — but it removes the bulk of the noise. Tuning
the keyword lists in `fresher.js` is a great first contribution.

---

## ⚙️ Configuration (all optional)

Every source is free and keyless, so the app runs with **zero configuration**. To
override defaults, copy `server/.env.example` to `server/.env`:

| Variable           | Default                 | Description                              |
| ------------------ | ----------------------- | ---------------------------------------- |
| `PORT`             | `8787`                  | API port                                 |
| `CLIENT_ORIGIN`    | `http://localhost:5173` | Comma-separated CORS allow-list          |
| `CACHE_TTL_MS`     | `1800000` (30 min)      | How long fetched jobs are cached         |
| `FETCH_TIMEOUT_MS` | `12000`                 | Per-source upstream request timeout      |
| `MAX_AGE_DAYS`     | `60`                    | Drop postings older than this many days  |

`.env` files are git-ignored and must never be committed.

---

## 🔒 Security notes

- The frontend never calls third-party APIs directly — it only talks to our backend,
  which keeps the surface small and CORS simple.
- Third-party HTML descriptions are **stripped to plain text on the server**, so no
  untrusted markup ever reaches the browser (no stored-XSS from postings).
- `helmet` sets security headers; `express-rate-limit` caps requests to 60/min/IP.
- All query parameters are validated and clamped before use.
- No secrets are needed or stored. Anything sensitive belongs in `.env` (git-ignored).

---

## 🚢 Production build

```bash
npm run build   # builds client/dist
npm start       # Express serves the API + the built dashboard on PORT
```

The server automatically serves `client/dist` when it exists, so a single Node process
can host the whole app. Point a host (Render, Railway, Fly, a VPS, …) at `npm start`.

---

## 🤝 Contributing (Tejas & Soorya)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch-based workflow. In short:

```bash
git checkout -b feature/your-thing
# ...make changes...
git commit -m "Add your thing"
git push -u origin feature/your-thing
# then open a Pull Request on GitHub
```

Work on feature branches and merge via PRs to keep `main` stable for both of you.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.
