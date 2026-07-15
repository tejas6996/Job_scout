# 🧭 JobScout

A minimalist dashboard that curates **entry-level & early-career jobs for freshers in India** —
internships, apprenticeships, graduate/management trainee programs, and full-time roles requiring
**0–2 years of experience**. It pulls postings from several job sources (some free/keyless, some
requiring your own API key), filters out senior-only roles and non-India listings, and presents
what's left in a clean, fast, distraction-free UI.

> Built to make the fresher job hunt in India a little less painful.

---

## ✨ Features

- **India-only sourcing** — every request is scoped to India at the API level (Adzuna/JSearch
  `country=in`, city-targeted queries), not filtered after the fact. Global-remote sources
  (Jobicy, Remotive) are kept only for their "Remote – India" postings.
- **Freshers-only, two-stage filter** — Stage A is a fast, deterministic, auditable rules engine
  that understands Indian JD phrasing (`0-2 years`, `Freshers only`, `Exp: 3-5 Yrs`, `GET`,
  `Trainee`, `Intern`, `Apprentice`, `Entry Level`, ...). Anything Stage A can't confidently
  resolve is deferred to Stage B, an LLM classifier that returns strict JSON. The filter is biased
  toward **excluding** when unsure — see [MIGRATION.md](MIGRATION.md) for why.
- **Location-aware** — Bengaluru/Bangalore/Blr, Gurugram/Gurgaon, Delhi/NCR, Mumbai/Bombay,
  Hyderabad, Pune, Chennai/Madras, Noida, Kolkata, Ahmedabad, Coimbatore, Remote–India and Hybrid
  all normalize to one canonical location (`server/src/location.js`), with Bengaluru/Hyderabad/
  Remote–India boosted in the fit score.
- **Indian compensation, parsed** — LPA/lakh/crore notation, Indian-style comma grouping
  (`5,50,000`), monthly internship stipends, "Not Disclosed" and "Unpaid" are all parsed into
  canonical fields rather than shown as a raw string (`server/src/compensation.js`).
- **Deduped across sources** — the same posting on three different boards collapses into one
  listing, keeping whichever copy has the richest data and the most direct apply link.
- **Fit-scored** — skill overlap, location match, role-type fit, compensation transparency,
  recency, and application-deadline urgency (`server/src/scoring.js`).
- **Auditable** — every excluded job is logged with its reason to `server/logs/`, and every run
  logs its funnel (fetched → deduped → filtered → kept) so you can see where postings are lost.
- **Secure by design** — the browser only talks to our own backend, which adds security headers
  (helmet), rate limiting, input validation, and caching.

---

## 🧱 Tech stack

| Layer     | Tech                                               |
| --------- | -------------------------------------------------- |
| Frontend  | React 18 + Vite 6 + Tailwind CSS 3                  |
| Backend   | Node.js (18+) + Express 4                           |
| Security  | helmet, express-rate-limit, CORS allow-list        |
| Sources   | Jobicy, Remotive (free/keyless), Adzuna, JSearch (need a key), 24 company boards on Greenhouse/Lever/Ashby/SmartRecruiters/Workable (all free/keyless) |
| Config    | `config/india.yaml` — locations, keywords, thresholds, source toggles |

This is an **npm workspaces monorepo** — one install command sets up everything.

---

## 📁 Project structure

```
Job_scout/
├── config/
│   └── india.yaml          # locations, role keywords, thresholds, source toggles, rate limits
├── client/                 # React + Vite + Tailwind dashboard
│   └── src/
│       ├── App.jsx         # State, data fetching, layout
│       ├── components/     # Header, Controls, JobCard, JobList, …
│       └── lib/            # API client + INR/date formatting helpers
├── server/                 # Express API (sourcing + filtering + scoring)
│   └── src/
│       ├── index.js        # App entry, security middleware
│       ├── routes/jobs.js  # /api/jobs, /api/meta
│       ├── config/loadConfig.js
│       ├── location.js     # Indian city alias canonicalization
│       ├── compensation.js # LPA/lakh/crore/stipend parser
│       ├── deadline.js     # "Apply by" extraction
│       ├── dedupe.js       # cross-source dedupe (normalized key + fuzzy title match)
│       ├── scoring.js      # fit score
│       ├── logging.js      # funnel + excluded-jobs audit log
│       ├── pipeline.js     # shared raw-jobs -> kept-jobs pipeline (used live and by --dry-run)
│       ├── dryRun.js       # `npm run dry-run` — runs the pipeline against fixtures, no network
│       ├── filters/        # Stage A (deterministic) + Stage B (LLM) fresher classifier
│       └── sources/        # one adapter per job source, behind a shared provider interface
├── tests/
│   └── fixtures/jobs.json  # ~30 realistic Indian JDs with expected verdicts
├── package.json             # Workspaces + dev/build scripts
└── README.md
```

---

## 🚀 Getting started

### Prerequisites
- **Node.js 18 or newer** (this project was built on Node 20/22). Check with `node --version`.

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

Then open **http://localhost:5173** in your browser.

> The dashboard (Vite, port 5173) proxies `/api` requests to the backend (Express, port 8787), so
> you only ever load one origin in the browser.

Out of the box (no API keys) you'll get Jobicy/Remotive (global-remote, filtered down to
Bengaluru postings — see **Locations** below) and the 24 seeded company boards across Greenhouse,
Lever, Ashby, SmartRecruiters and Workable. For real Indian city listings, add the Adzuna and
JSearch keys — see **Configuration** below.

### Available scripts (run from the repo root)

| Command              | What it does                                          |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`        | Runs the API **and** dashboard together (recommended) |
| `npm run dev:server` | Runs only the backend API                             |
| `npm run dev:client` | Runs only the frontend                                |
| `npm run build`      | Builds the production dashboard into `client/dist`    |
| `npm start`          | Runs the API and serves the built dashboard (prod)    |

From `server/`:

| Command             | What it does                                                                 |
| -------------------- | ----------------------------------------------------------------------------- |
| `npm run dry-run`   | Runs the whole pipeline against `tests/fixtures/jobs.json` and prints the funnel — no live network calls, no API keys needed |
| `npm test`          | Runs the test suite (`node --test`)                                          |

---

## 🎯 How the fresher filter works

`server/src/filters/` implements a two-stage classifier:

1. **Stage A** (`stageA.js`) — deterministic regex rules. Parses `min_years`/`max_years` out of
   the title + description, recognizing Indian JD phrasing (`0-2 years`, `0–1 yrs`, `Fresher`,
   `Freshers only`, `Exp: 3-5 Yrs`, `Minimum 4 years`, `GET`, `Trainee`, `Intern`, `Apprentice`,
   `Entry Level`, `Junior`, ...). Hard-excludes senior/lead/principal/staff/manager/architect
   titles and open-ended experience requirements (`3+ years`, `minimum 3 years`) outright. A role
   whose numbers are borderline can only be pulled back in by a fresher-role word **in the
   title** — not a stray mention buried in the job description.
2. **Stage B** (`stageB.js`) — for whatever Stage A can't resolve, an LLM call (Gemini, via
   `GEMINI_API_KEY`) is asked to return strict JSON: `is_fresher_eligible`, `min_years`,
   `max_years`, `role_type`, `confidence`, `reason`. Without a key configured, or on any
   parse/network failure, the job is **excluded** rather than guessed at.

Every excluded job (from either stage) is logged with its reason to `server/logs/excluded-<date>.jsonl`
so you can audit false negatives. Every run's funnel (fetched → after India/freshness filter →
deduped → excluded → kept) is logged to `server/logs/funnel-<date>.jsonl`.

---

## 🇮🇳 Locations

`server/src/location.js` canonicalizes free-text locations against the alias table in
`config/india.yaml` (Bengaluru/Bangalore/Blr all resolve to one canonical key, etc.). On top of
that, `locations.scope` is a **hard filter** — currently `[bengaluru]`, so this dashboard only
ever surfaces Bengaluru postings, regardless of source. A posting that doesn't canonicalize to
something in `scope` is dropped before it ever reaches the fresher filter. To widen the dashboard
to more cities, add them to `locations.scope` in `config/india.yaml` — no code change needed. An
empty/omitted `scope` means unrestricted (any canonical India location is allowed).

---

## 💰 Compensation

`server/src/compensation.js` parses LPA/lakh/crore notation, Indian comma grouping (`5,50,000`),
monthly stipends, `"Not Disclosed"` and `"Unpaid"` into:

```json
{
  "salary_min_inr_annual": 400000,
  "salary_max_inr_annual": 600000,
  "stipend_inr_monthly": null,
  "is_unpaid": false,
  "compensation_disclosed": true
}
```

---

## ⚙️ Configuration

Non-secret pipeline config — locations, role/exclusion keywords, the max-experience threshold,
freshness window, source toggles, ATS company list, and rate limits — lives in
**`config/india.yaml`**. Edit that file, not the source, to retune the pipeline.

Secrets go in `server/.env` (copy from `server/.env.example`; git-ignored, never commit it):

| Variable            | Required? | What it's for                                              |
| -------------------- | --------- | ------------------------------------------------------------ |
| `PORT`               | no        | API port (default `8787`)                                   |
| `CLIENT_ORIGIN`      | no        | Comma-separated CORS allow-list                             |
| `CACHE_TTL_MS`       | no        | How long fetched jobs are cached (default 30 min)            |
| `FETCH_TIMEOUT_MS`   | no        | Per-source upstream request timeout                          |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | no (recommended) | [developer.adzuna.com](https://developer.adzuna.com) — real Indian city listings |
| `JSEARCH_API_KEY`    | no (recommended) | [RapidAPI JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) — real Indian city listings |
| `GEMINI_API_KEY`     | no (recommended) | [Google AI Studio](https://aistudio.google.com) — powers the Stage B classifier |

Without the Adzuna/JSearch keys, those two sources return no results (not an error — they degrade
gracefully). Without `GEMINI_API_KEY`, Stage-B-eligible jobs are excluded rather than guessed at.

---

## ➕ Adding a new source

**Adding a company already on Greenhouse, Lever, Ashby, SmartRecruiters or Workable** needs no
code at all — add `{ type: <platform>, token: <company-slug> }` to `ats_companies` in
`config/india.yaml` (see `server/src/sources/atsBoards.js` for what each platform's token/slug
looks like). Verify the slug live first (`curl` the platform's API — e.g.
`https://api.ashbyhq.com/posting-api/job-board/<slug>` — and check for a 200 with real postings)
before adding it; a guessed slug just silently returns zero jobs.

**Adding an entirely new platform/API** is a real adapter, behind the shared interface
(`server/src/sources/provider.js`):

1. Create `server/src/sources/yourSource.js` exporting `SOURCE_NAME` and `async fetchJobs(cfg)`
   that returns an array of jobs shaped per `RAW_JOB_SHAPE` in `provider.js` — pass each one
   through `normalizeProviderJob(job, SOURCE_NAME)` so missing fields get safe defaults.
2. Register it in the `PROVIDERS` map in `server/src/sources/index.js`.
3. Add a toggle for it in `config/india.yaml` under `sources:`.

Everything downstream (location canonicalization, compensation parsing, dedupe, the fresher
filter, scoring) works automatically once a source conforms to the interface. Naukri, LinkedIn
India, Indeed India, Wellfound India, Instahyre, Hirist, Foundit, Internshala and Unstop don't have
public/free APIs — they're listed (disabled) in `config/india.yaml` as a starting point for a
scraping-based adapter, but none is implemented yet (a deliberate choice — see
[MIGRATION.md](MIGRATION.md) for the trade-offs). If a list endpoint doesn't include a
free-text description (SmartRecruiters, Workable), don't reach for an N+1 per-posting detail
fetch by default — check whether the list response has a structured experience/seniority field
first and fold it into a synthetic description, the way `atsBoards.js` does for both.

---

## 🔒 Security notes

- The frontend never calls third-party APIs directly — it only talks to our backend, which keeps
  the surface small and CORS simple.
- Third-party HTML descriptions are **stripped to plain text on the server**, so no untrusted
  markup ever reaches the browser (no stored-XSS from postings).
- `helmet` sets security headers; `express-rate-limit` caps requests to 60/min/IP; each source
  fetch has its own timeout, retry-with-backoff, and is isolated via `Promise.allSettled` so one
  dead source never takes the others down.
- Secrets live only in `.env` files (git-ignored). `config/india.yaml` holds no secrets by design.

---

## 🚢 Production build

```bash
npm run build   # builds client/dist
npm start       # Express serves the API + the built dashboard on PORT
```

---

## 🤝 Contributing (Tejas & Soorya)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch-based workflow.

```bash
npm install     # first time only (installs client + server)
npm run dev      # API on :8787, dashboard on :5173 -> open http://localhost:5173
```

## 📄 License

[MIT](LICENSE) — free to use, modify, and share.
