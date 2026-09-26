---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: What should the database let you do that you can't do today?

Recommended Answer:
- Keep a permanent record of every run's findings, so a past audit is never lost.
- Every `pnpm scraper <url>` run saves its findings, and the Scorecard and report are then built from the saved rows, not the in-memory list (`docs/scoring-pipeline.md` step 4, "read back").
- One new visible capability: a command that rebuilds the Scorecard and report of an earlier audit without visiting the website, e.g. `pnpm scraper --audit 42`.
- Not in this Spec: comparing two audits (step 12, the diff), the web app, and saving the raw page snapshots.

Answer: Yes, that matches — go with your recommendation.

Decision: This Spec persists every audit and adds `--audit <id>` to rebuild a Scorecard and report from saved rows alone. The diff, the web app and snapshot storage are out of scope.

Reason: Saving data that nothing reads can't be checked. A reader proves the saved copy is enough to rebuild everything, which the later diff depends on.

### L2

Status: current

Question: What do we call one saved run, and the website it belongs to?

Recommended Answer:
- **Audit**: one use of the tool against one site — the pages it sampled, every finding it produced, and the Scorecard read from them — kept as one saved record, one row in the `audit` table.
- **Site**: the website being audited, one per host with `www.` ignored. One site has many audits.
- Avoid "run", "crawl", "scan" and "job" as the name of the saved thing. "Run" stays fine in loose prose, never as a table, column or command name.

Answer: Yes, record Audit and Site that way.

Decision: **Audit** and **Site** are canonical and were added to `GLOSSARY.md`.

Reason: The spec's table, the glossary's *Scorecard* entry and the terminal's "No audit produced." already used "audit". The user later confirmed that an audit covers the whole site from the typed URL, not a single URL, and that a finding is one check's result about one subject (a page, the site, or a PDF).

### L3

Status: current

Question: Which database should hold the audits?

Recommended Answer: SQLite through Node's built-in `node:sqlite`, with Postgres deferred to hosting time.

Answer: I will be using Supabase to store my data.

Decision: Audits are stored in Supabase (hosted Postgres).

Answer History:
- Recommended: SQLite, because nothing is installed locally.
- Final answer: Supabase.

### L4

Status: current

Question: How should the scraper connect to Supabase?

Recommended Answer: A direct Postgres connection through the `postgres` package (postgres.js) and one `DATABASE_URL`, so each audit saves in a single transaction.

Answer: We are going to use supabase-js. I am happy to take the risk of writing lots of data.

Decision: The scraper uses `@supabase/supabase-js`. An audit's save is not one transaction, and a partly saved audit is possible and accepted.

Reason: The user was told the three trade-offs and chose supabase-js anyway: no all-or-nothing save; reads silently cap at 1,000 rows unless paged; and the code is tied to Supabase rather than to plain Postgres. L5 makes a partial save visible, and L5 also requires paging.

Answer History:
- Recommended: postgres.js with a transaction.
- Final answer: supabase-js, accepting the partial-write risk.

### L5

Status: current

Question: How is a half-saved audit marked, and what happens when saving fails?

Recommended Answer:
- Save order: find or create the `site` row; create the `audit` row with `status = 'running'`; insert findings in batches of 500; update the audit to `status = 'done'`.
- If any step fails: try to set the audit to `'failed'`, print `Audit not saved — <reason>.`, and carry on as if there were no database. The terminal Scorecard and the Markdown report are built from the in-memory findings, and the exit code stays the same.
- If saving works: the Scorecard and report are built from the rows read back from Supabase, and the terminal prints `Audit 42 saved.`
- Reading back pages through the 1,000-row limit with `.range()`, then compares the count read with the count saved. A mismatch counts as a failed save, not as a smaller Scorecard.
- `--audit 42` refuses an audit that isn't `'done'`: `Audit 42 is <status> — its findings are incomplete, so no scorecard.` and a non-zero exit.
- A `'running'` audit that never finished (e.g. Ctrl-C) stays `'running'`. Nothing cleans it up.
- No Supabase settings: the tool works as today plus one line, `Audit not saved — no Supabase settings in scraper/.env.` It is not an error.

Answer: Yes, that's fine.

Decision: `audit.status` is the completeness signal: only `'done'` is a complete audit. A failed save never changes the exit code, and never costs the run its terminal output or report.

Reason: Without a transaction, status is the only honest signal. It mirrors the report's rule that a failed save costs only the saved copy.

Negative Requirements:
- No cleanup of stuck `'running'` audits.
- A failed save does not change the exit code.

### L6

Status: current

Question: What do the tables store?

Recommended Answer:
- `site`: `id`, `host` (with `www.` removed; unique), `created_at`. No `archetype`.
- `audit`: `id` (a plain integer, typed as `--audit 42`), `site_id`, `typed_url`, `created_at` (the run's date, shown in the report), `ruleset_version`, `status` (`running`/`done`/`failed`), `coverage` (JSON).
- `finding`: `id`, `audit_id`, `criterion_key`, `url` (never null — site findings already use the site root), `status`, `evidence` (JSON). Exactly the `Finding` shape.
- Not stored: the score, dimension scores, gate and report text. They are readings of the findings, rebuilt by `--audit`, and would go stale on a rulebook change.
- Coverage is the existing `ReportCoverage` value, except each template stores `size` (a number) instead of its full `urls` list.

Answer: Yes, approved.

Decision: Three tables as above. Coverage has two shapes, told apart by `kind`:
- `"sample"`: `sitemapUrl`, `eligibleCount`, `templates` (largest first, each `{ label, size, sampled }`), `templatesLeftOut`, `pages` (capture order, typed URL first), `audited`, `unreachable`, `notCaptured`.
- `"fallback"`: `reason`, one of `"no sitemap"`, `"sitemap index"`, `"no eligible URLs"`.

Reason: This is the smallest set that lets `--audit` print the same Scorecard and report as the original run. The report's Coverage part and the Fix first template lines need data no finding carries. After sampling, the code reads only `template.urls.length`, and a big sitemap would put megabytes of URLs into every audit row.

Examples:
- `{ "kind": "fallback", "reason": "no sitemap" }`

### L7

Status: current

Question: Which Supabase key does the scraper use, and who else can reach the tables?

Recommended Answer:
- Two settings in `scraper/.env`: `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (a `sb_secret_…` key, or a legacy `service_role` key). Both go in `scraper/.env.example` as placeholders. The `start` script gets `--env-file-if-exists=.env`.
- Row Level Security switched on for all three tables with no policies, in the same SQL file that creates them, so the publishable key reaches nothing.
- Only one of the two settings present is treated like none: `Audit not saved — SUPABASE_SECRET_KEY missing from scraper/.env.`, and the run carries on.
- The secret key is never printed, whether in errors or in the report.

Answer: Yes, that's fine.

Decision: Secret key server-side only; RLS on with no policies; web-app read policies belong to a later Spec.

Reason: Supabase exposes every table through its web API, so without RLS anyone holding the public key could read or write every audit.

Negative Requirements:
- Never print the secret key.
- No RLS policies in this Spec.

### L8

Status: current

Question: What exactly does `pnpm scraper --audit 42` do?

Recommended Answer:
- It contacts no website. It reads audit 42's `site`, `audit` and `finding` rows from Supabase only.
- It scores with today's `criteria.yaml`. When the version differs from `audit.ruleset_version`, the terminal and the report header both say so: `rulebook v0.2.0 (audit ran under v0.1.0)`. A finding's status is not re-judged — thresholds were applied on the day, so a threshold change still needs a fresh audit.
- It prints the Scorecard and Fix first blocks, not the section blocks or capture lines.
- It saves a report to `~/Downloads` under today's rules, with the audit's original date in the header and a filename timestamped with the current time.
- It saves nothing new to Supabase.
- It stops with a clear message and a non-zero exit when: there is no such audit (`No audit 42.`); the audit isn't `done` (L5); the Supabase settings are missing; a finding's key is no longer in the rulebook (`Audit 42 has findings for access.old_check, which criteria.yaml no longer defines.`).
- A URL together with `--audit` is a usage error.

Answer: Yes, that's fine.

Decision: `--audit` is a pure rebuild from saved rows under the current rulebook.

Reason: The rulebook has been `v0.1.0` since it was added and the repo has no git tags, so the rulebook "as it was on the day" cannot be loaded. The point of re-scoring is to see an old audit under a changed rulebook. The user confirmed the workflow: the scraper audits and saves, and saved audits are read back as needed; `--audit` is optional.

### L9

Status: current

Question: What needs automated tests at this point?

Recommended Answer:
- One unit test: host normalising (`www.example.com` and `example.com` are one site), because getting it wrong silently splits a site in two.
- No round-trip unit test of the row conversion.
- Everything else is checked by hand once, from a list in the Spec, including that the report from `--audit 42` matches the original run's report in `~/Downloads` apart from the rulebook line.
- No fake Supabase and no local Supabase (it needs Docker, which isn't installed).
- The tables are created by one SQL file, `supabase/migrations/0001_audits.sql`, pasted once into the Supabase SQL editor. The Supabase CLI is not required.

Answer: Ok, both tests are fine … yes, that's fine.

Decision: Host normalising is the only automated test. The Supabase round trip is verified by hand against the real project.

Reason: The user questioned a round-trip test over a made-up fixture. The realistic failures (key re-sorting, the 1,000-row cap) happen inside Supabase, where a fixture test can't reach, and the hand comparison of two real reports catches those and any forgotten field.

Answer History:
- Initially recommended: a round-trip unit test (fixture → rows → back → identical report) plus the host test.
- Final answer: host test only, with the round trip checked by hand.

### L10

Status: current

Question: Should the JSON columns keep their keys in the order they were written?

Recommended Answer: Use the `json` column type, not `jsonb`, for `finding.evidence` and `audit.coverage`.

Answer: Yes, that's fine.

Decision: `evidence` and `coverage` are `json` columns.

Reason: The report prints evidence in key order (`Object.entries` in `report.ts`). `jsonb` re-sorts keys on save, so a rebuilt report would list evidence differently from the original. The cost is no indexes inside the evidence, which nothing needs yet; a later Spec can add a `jsonb` copy.

### L11

Status: current

Question: How do you find an audit's number later?

Recommended Answer:
- Put the number in the report header when the audit was saved: `2026-09-26 14:02 · rulebook v0.1.0 · audit 42`. When the save failed, the header is exactly what it is today.
- No "list audits" command in this Spec. The Supabase dashboard lists them; the web app will do it properly later.

Answer: Yes, that's fine.

Decision: The report header carries the audit number whenever the audit was saved.

Reason: The report is the thing the user keeps, so it is the natural place to carry the number.

### L12

Status: current

Question: Which smaller defaults apply unless the user says otherwise?

Recommended Answer:
- Findings are read back in the order they were saved (by `id`).
- A run where no page could be reached saves nothing, because no audit was produced.
- `agent-readiness-auditor-spec.md` §7 and §12, `docs/scoring-pipeline.md` and `CLAUDE.md` are updated to match: supabase-js, `json` instead of `jsonb`, and the `--audit` command.

Answer: Accepted at the Spec-ready checkpoint (the user chose to write the Spec).

Decision: These defaults hold.
