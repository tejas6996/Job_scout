# Migration: US/global-remote dashboard → India freshers-only

This documents the refactor of `client/` + `server/` from a global-remote entry-level job
dashboard into an India-only, freshers-only (0–2 yrs) one. If you're picking this up after a
`git pull`, read the **"What you need to do manually"** section first.

## Why "Option A" (convert the dashboard, not the `soorya` pipeline)

There are two India-job-related codebases in this repo's history:

1. `client/` + `server/` (this branch) — a browsable dashboard, the one this migration targets.
2. `pipeline/` on the `soorya` branch — a separate, already-India-scoped Node service (Adzuna +
   JSearch + Greenhouse/Lever + Gemini scoring, writing results into Notion instead of a
   dashboard). It shares no code with `client/`/`server/` and covers a narrower role scope
   (data/BI/ML analyst titles only, Bengaluru only, no INR parsing, no multi-city aliasing).

This refactor converts the dashboard because its deliverables (config file, `--dry-run`, fixture
tests, fit scoring) map onto it directly. The `soorya` pipeline was left untouched — merging the
two into one engine was considered and explicitly deferred as a larger, separate piece of work.
If you want the two unified later, `server/src/sources/provider.js`'s adapter interface is the
place to start: `pipeline/src/sources/adzuna.js` and `jsearch.js` (on `soorya`) are already close
to that shape.

## What was removed

- **`server/src/sources/arbeitnow.js`** — Arbeitnow is explicitly Europe-focused; essentially
  never India-relevant. Deleted rather than filtered, to keep the source list honest.
- **`server/src/util/lang.js`** — existed only to detect German (for Arbeitnow postings). No
  India-relevant use case, deleted with Arbeitnow.
- **`server/src/fresher.js`** — superseded by the two-stage `server/src/filters/stageA.js` +
  `stageB.js`. The old heuristic used a single English/German regex pass and a ≤3-year threshold;
  the new one understands Indian JD phrasing and uses the ≤2-year threshold from
  `config/india.yaml`.
- **The `lang`/"Include non-English" toggle** (client + `/api/jobs?lang=`) — Indian JDs are
  English by default; this existed to filter German postings out of Arbeitnow, which is gone.

There was **no US-specific code to remove** in the literal sense — no hardcoded USD/ZIP/H1B/401k/
sponsorship logic existed anywhere in `client/` or `server/` before this refactor (confirmed by
grep, and enforced going forward by `server/tests/us-regression.test.js`). The actual gap was
"global-remote/EU-first by default, India absent entirely," not "hardcoded US" — see the
discovery notes from before this refactor for the full inventory.

## What you need to do manually

1. **API keys, if you want real Indian listings.** Without any keys, you'll only see
   Jobicy/Remotive's "Remote – India" postings and whatever the 3 seeded Greenhouse/Lever
   companies (`groww`, `postman`, `cred`) have open. For real city-scoped Indian listings:
   - Adzuna: [developer.adzuna.com](https://developer.adzuna.com) → `ADZUNA_APP_ID` /
     `ADZUNA_APP_KEY` in `server/.env`.
   - JSearch: [RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) →
     `JSEARCH_API_KEY` in `server/.env`.
   - Gemini (Stage B classifier): [Google AI Studio](https://aistudio.google.com) →
     `GEMINI_API_KEY` in `server/.env`.

   Your local `pipeline/.env` (untracked, on this working copy) already has live Adzuna/JSearch/
   Gemini keys from the `soorya`-branch pipeline — those are the *same kind* of credentials
   (general-purpose Adzuna/JSearch/Gemini API keys, not tied to that pipeline's Notion database),
   so you can copy the `ADZUNA_*`/`JSEARCH_API_KEY`/`GEMINI_API_KEY` values into `server/.env` if
   you want this dashboard populated immediately. This refactor does **not** do that copy for
   you, to avoid silently duplicating credentials across two systems without your say-so.

2. **Add more ATS companies.** The seeded list (`groww`, `postman`, `cred`) is small. Add any
   company with a Greenhouse or Lever careers page to `config/india.yaml` under
   `sources.ats_companies` — no code change needed.

3. **Naukri / Internshala / Unstop / LinkedIn India / Indeed India / Wellfound India / Instahyre /
   Hirist / Foundit are not implemented.** None of these publish a public/free API; a real
   integration means scraping, which is a meaningfully larger and riskier piece of work (fragile
   selectors, ToS considerations, needs its own rate-limiting). They're listed, disabled, in
   `config/india.yaml`'s `sources:` block as a placeholder — flip one on only after writing its
   adapter behind `server/src/sources/provider.js`.

4. **Re-check `config/india.yaml` defaults.** `experience.max_years: 2`, `freshness.max_age_days:
   21`, and `locations.priority: [bengaluru, hyderabad, remote_india]` reflect the choices made
   for this refactor — change them there, not in code, if your priorities differ.

## Behavioral changes worth knowing about

- **Stricter by default.** Per an explicit "prefer excluding a borderline job over including a
  senior one" instruction, a job with an experience range that partially exceeds the threshold
  (e.g. "1 to 3 years") is excluded unless the **title itself** carries a fresher-role word
  (intern/trainee/fresher/GET/graduate/...). A fresher word only in the job description body does
  *not* override an otherwise-excluding number — this was tightened after a live smoke test
  showed a 2–4 yr "Recruiting Coordinator" role slipping through because its JD happened to
  mention "our internship program" as a duty, not a role type.
- **`/api/jobs` response shape changed**: `level` query param now takes role types
  (`internship`/`apprenticeship`/`trainee`/`full_time_entry`) instead of the old
  (`internship`/`entry`/`junior`/`open`); a new `location` query param filters by canonical
  location; `lang` was removed; jobs now carry `compensation`, `applyBy`, `locationCanonical`,
  and `fitScore` fields they didn't have before.
- **Freshness window dropped from 60 to 21 days**, and the dedupe key changed from a bare
  `title::company` string match to `company + fuzzy-title + canonical-location + posted-week`.
