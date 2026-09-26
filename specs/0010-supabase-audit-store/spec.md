---
type: Spec
title: Supabase audit store
---

## Problem

An audit lives only in memory. A run prints to the terminal, saves a Markdown report to `~/Downloads`, and then every finding is gone. Nothing can be re-scored after a rulebook change without auditing the site again, and there is nothing for a future diff or web app to read. [L1]

The spec plans `site` → `audit` → `finding` tables and says "YAML holds the questions. The database holds the answers." `docs/scoring-pipeline.md` records steps 3 (insert), 4 (read back) and 12 (diff) as not built, because there is no database. [L1]

## Proposed Outcome

Every `pnpm scraper <url>` run saves its **audit** — the site, the coverage and every finding — to Supabase. It then builds its Scorecard and report from the rows it reads back, which proves on every run that the saved copy is complete. [L1] [L3] [L5]

A new command, `pnpm scraper --audit <id>`, rebuilds a saved audit's Scorecard and report from Supabase alone, under today's `criteria.yaml`, without contacting the website. [L1] [L8]

Saving is never fatal. With no Supabase settings, or when a save fails, the run behaves exactly as it does today plus one line. [L5] [L7]

## User Stories

1. As the operator, I want every audit saved without passing a flag, so that no past audit is lost. [L1] [L5]
2. As the operator, I want a failed or skipped save to leave the finished audit on screen and in `~/Downloads`, not crash the run or change its exit code. [L5] [L7]
3. As the operator, I want to change `criteria.yaml` and see what an old audit scores under the new rulebook, without auditing the site again. [L1] [L8]
4. As the operator, I want an old audit's report back when I no longer have the file. [L8]
5. As the operator, I want a half-saved audit never mistaken for a complete one. [L4] [L5]
6. As the operator, I want each report to carry its audit number, so I can find the audit again later. [L11]
7. As the site's owner, I want nobody holding the project's public key to be able to read or change the saved audits. [L7]

## Requirements

### Terminology

1. **Audit** and **Site** are used as defined in `GLOSSARY.md`. "Run", "crawl", "scan" and "job" never name a table, column or command. [L2]

### Tables

2. `site`: `id`, `host` (unique; with `www.` removed), `created_at` (when the site was first audited, never overwritten by a later audit). There is no `archetype` column. [L6]
3. `audit`: `id` (integer, the number typed after `--audit`), `site_id` → `site.id`, `typed_url` (exactly as typed), `created_at`, `ruleset_version` (the loaded rulebook's `version`), `status` (one of `running`, `done`, `failed`), `coverage`. [L6]
4. `finding`: `id`, `audit_id` → `audit.id`, `criterion_key`, `url` (not null), `status` (one of `pass`, `fail`, `warn`, `skip`), `evidence`. A row holds exactly a `Finding` and nothing added. [L6]
5. `finding.evidence` and `audit.coverage` are Postgres `json` columns, not `jsonb`, so keys come back in the order they were written. [L10]
6. No score, dimension score, gate or report text is stored anywhere. [L6]
7. Finding rows are never updated after insert. [L6]
8. `audit.created_at` is the run's date. The scraper sends it, and it is the same instant the run's report uses in its header. [L6] [L8]

### Coverage

9. `coverage` is the run's `ReportCoverage`, with one change: each template stores `size` (its URL count) instead of its `urls` list. [L6]
10. The `"sample"` shape holds `kind`, `sitemapUrl`, `eligibleCount`, `templates` (largest first, each `{ label, size, sampled }`), `templatesLeftOut`, `pages` (capture order, typed URL first), `audited`, `unreachable` and `notCaptured`. [L6]
11. The `"fallback"` shape holds `kind` and `reason`, one of `"no sitemap"`, `"sitemap index"`, `"no eligible URLs"`. Example: `{ "kind": "fallback", "reason": "no sitemap" }`. [L6]

### Site identity

12. A site is identified by its host, lower-case, with a leading `www.` removed and the scheme ignored. `https://www.Example.com/pricing` and `http://example.com/` are one site, `example.com`. [L2] [L9]
13. An audit of an existing host reuses that `site` row rather than creating a second one. [L2]

### Saving an audit

14. Every `pnpm scraper <url>` run that produces findings saves one audit. No flag is needed. [L1] [L5]
15. The save happens after every section has run and before the Scorecard is printed, in this order: [L5]
    1. Find or create the `site` row.
    2. Insert the `audit` row with `status = 'running'`.
    3. Insert the findings in batches of 500, in the order they were collected.
    4. Update the audit to `status = 'done'`.
    5. Read the audit's findings back, ordered by `id`, paging past Supabase's 1,000-row limit with `.range()`.
16. When the count read back differs from the count inserted, the save counts as failed. [L5]
17. On success the terminal prints `Audit <id> saved.` before the Scorecard. The Scorecard, Fix first and the report are built from the findings and coverage read back. [L1] [L5]
18. On any failure — a network error, an insert error, or a count mismatch — the run tries to set the audit's status to `'failed'` if the audit row exists, and prints `Audit not saved — <reason>.`. It then builds the Scorecard and report from the in-memory findings and coverage. [L5]
19. A failed or skipped save never changes the run's exit code. [L5]
20. A run where no page could be reached, which stops with "No audit produced." before any section runs, saves nothing. [L12]
21. An audit left `'running'` (for example after Ctrl-C) stays `'running'`. Nothing cleans it up. [L5]

### Settings and security

22. The scraper reads two settings from `scraper/.env`: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The key is a `sb_secret_…` secret key or a legacy `service_role` key. Both are added to `scraper/.env.example` as placeholders, in the same commit. [L7]
23. The scraper's `start` script gains `--env-file-if-exists=.env`, so Node reads `scraper/.env`. [L7]
24. With neither setting present, a run prints `Audit not saved — no Supabase settings in scraper/.env.` and otherwise behaves as today. This is not an error. [L5] [L7]
25. With exactly one present, the run names the missing one — e.g. `Audit not saved — SUPABASE_SECRET_KEY missing from scraper/.env.` — and carries on. [L7]
26. The secret key is never printed, whether in the terminal, in an error reason or in a report. [L7]
27. Row Level Security is enabled on `site`, `audit` and `finding` with no policies, in the same SQL file that creates them, so the publishable key can read and write nothing. [L7]

### The report header

28. When the audit was saved, the report's date line ends with ` · audit <id>` — e.g. `2026-09-26 14:02 · rulebook v0.1.0 · audit 42`. When it wasn't saved, the line is exactly what it is today. [L11]
29. When the rulebook's `version` differs from `audit.ruleset_version`, the rulebook part reads `rulebook v0.2.0 (audit ran under v0.1.0)`. [L8]

### `pnpm scraper --audit <id>`

30. `--audit <id>` takes a positive integer. It contacts no website. It reads the audit's `site`, `audit` and `finding` rows from Supabase, paging past the 1,000-row limit, ordered by `finding.id`. [L8]
31. It scores the findings with the current `criteria.yaml`. Each finding's `status` is used as saved and never re-judged, so a threshold change still needs a fresh audit. [L8]
32. Before the Scorecard, the terminal prints one line naming the audit, its host, its date and the rulebook, with the `(audit ran under …)` note when the versions differ (requirement 29). [L8]
33. It prints the Scorecard and Fix first blocks exactly as a normal run would. It does not print section blocks, the Pages block or capture lines. [L8]
34. It saves a report to `~/Downloads` under the existing rules: never over an existing file, never creating the folder, and a failed save prints `Report not saved — <reason>.` without changing the exit code. The header uses the audit's own `created_at` and carries ` · audit <id>`. The filename uses the audit's host and the current time, so re-scoring twice never collides. [L8] [L11]
35. It writes nothing to Supabase. [L8]
36. It stops with one line and a non-zero exit, printing no Scorecard and saving no report, when: [L5] [L8]
    - there is no such audit: `No audit 42.`
    - the audit isn't `done`: `Audit 42 is <status> — its findings are incomplete, so no scorecard.`
    - the Supabase settings are missing, naming which (as requirements 24–25)
    - Supabase can't be reached or returns an error: `Could not read audit 42 — <reason>.`
    - a finding's key is not in the rulebook: `Audit 42 has findings for <key>, which criteria.yaml no longer defines.`
37. `--audit` together with a URL, `--audit` without an id, or an id that isn't a positive integer is a usage error with a non-zero exit. [L8]

### Docs

38. `agent-readiness-auditor-spec.md` §7 and §12, `docs/scoring-pipeline.md` (steps 3, 4 and 12 and the "no database" notes) and `CLAUDE.md` (the "no database" statements, the Commands table and the Environment files section) are updated to match this Spec: Supabase through supabase-js, `json` rather than `jsonb`, no stored scores or report, and the `--audit` command. [L12]

## Technical Decisions

1. **Supabase through `@supabase/supabase-js`**, added as a scraper dependency. There is no direct Postgres connection and no transaction. The partial-write risk is accepted and made visible through `audit.status`. [L3] [L4] [L5]
2. **Every supabase-js call lives in one file**, e.g. `scraper/src/audit-store.ts`, outside every section folder, because it reads every dimension's findings. Like the other Phase 1 modules it **never throws**. A save returns the saved audit id and read-back rows, or a reason. A read returns the rows, or a reason. So `index.ts` needs no `try`/`catch`. [L4] [L5]
3. **Converting between the in-memory shapes and rows** — `Finding` ↔ `finding` row, `ReportCoverage` ↔ `coverage` — is pure code beside the store, with no Supabase import. [L6]
4. **One coverage shape for every renderer.** The report's Coverage part (`report.ts:79`), the terminal's Pages block (`print-report.ts:46`, `:64`) and `templateBreakdown` (`site-sample.ts:190`) read only a template's size. They are made to work from the stored shape (`size`), so a Scorecard and report rendered from read-back rows match one rendered from memory. [L6]
5. **Host normalising reuses `bareHost`** in `site-sample.ts` (currently private), exported, with lower-casing confirmed. The sample and the `site` table then agree on what "the same host" means. [L2] [L9]
6. **The SQL lives in `supabase/migrations/0001_audits.sql`** at the repo root. It creates the three tables with `status` check constraints, the foreign keys, RLS enabled with no policies, and indexes on `finding (audit_id, id)` and `audit (site_id, created_at desc)`. It is applied once by pasting it into the Supabase SQL editor. The Supabase CLI is not required. [L7] [L9]
7. **Why `json` and not `jsonb`:** `renderReport` prints evidence in key order (`Object.entries`, `report.ts:261`), and `jsonb` re-sorts keys. The cost is no index inside evidence, which nothing needs yet. [L10]
8. **`renderReport` gains two optional inputs**: the audit id, and the audit's rulebook version. With neither, it renders exactly what it renders today. It stays pure. [L8] [L11]
9. **`--audit` parsing:** `index.ts` currently takes the first argument not starting with `--` as the URL. That must change so `42` in `--audit 42` is never read as a URL. [L8]
10. **The scorer's existing throw on an unknown key** (`scorecard.ts:50`) is caught nowhere. `--audit` checks the read-back keys against the rulebook before scoring and prints requirement 36's message instead. [L8]

## Testing Strategy

1. **One automated test: host normalising**, under Node's built-in runner beside the existing tests. `www.example.com`, `WWW.Example.com` and `example.com` give one host, and `shop.example.com` gives a different one. The test calls the exported `bareHost` (Technical Decision 5), the existing pure function, so there is no network. [L9]
2. **No automated test touches Supabase.** There is no fake Supabase client and no local Supabase (it needs Docker, which this machine lacks). There is no fixture-based round-trip test of the row conversion. The realistic failures — key re-sorting and the 1,000-row cap — happen inside Supabase, where such a test can't reach. [L9] [L10]
3. **Hand checks against the real Supabase project**, each done once and recorded in the implementation notes: [L5] [L7] [L8] [L9] [L10] [L11]
   1. Apply `0001_audits.sql` in the SQL editor. The three tables exist, with RLS on.
   2. Run `pnpm scraper <url>` on a site with a sitemap. It prints `Audit <id> saved.`, and the `audit` row is `done` with the right finding count.
   3. Run `pnpm scraper --audit <id>`. Its report matches the original run's report in `~/Downloads` except for the rulebook part of the header, including evidence key order and the Coverage part.
   4. Repeat 2–3 on a site with no usable sitemap (fallback coverage).
   5. Audit the same site as `https://www.<host>` and `https://<host>`. There is one `site` row.
   6. Remove both settings: the run prints the no-settings line, and the exit code and report are unchanged. Remove one setting: the line names it.
   7. Use a wrong secret key: `Audit not saved — <reason>.`, with the key nowhere in the output.
   8. Set an audit's status to `running` in the dashboard: `--audit` refuses it.
   9. Run `--audit` with an id that doesn't exist.
   10. With the publishable key, reading any of the three tables through the API returns nothing.
   11. Bump `criteria.yaml`'s `version` locally: `--audit` shows `(audit ran under …)` in the terminal and the report.
   12. Run a 40-page audit (over 1,000 findings): the read-back count matches the insert count.
4. `pnpm lint` (`tsc --noEmit`) and `pnpm --filter scraper test` pass. [L9]

## Out of Scope

1. Comparing two audits (step 12, the diff). [L1]
2. The web app, and any RLS policy for it. [L1] [L7]
3. Saving page snapshots or any other raw capture. [L1]
4. A "list audits" command. [L11]
5. Cleaning up audits stuck in `'running'`. [L5]
6. Storing scores, gates or report text. [L6]
7. `site.archetype` and the spec's `task_run` table. [L6]
8. A direct Postgres connection, transactions, and a local Supabase for tests. [L4] [L9]
9. Loading an older rulebook version to re-score under. [L8]

## Follow-Ups

1. A diff Spec, matching findings on `criterion_key` + `url` across two `done` audits of one site. [L1]
2. A web-app Spec, adding read-only RLS policies and reading through supabase-js. [L4] [L7]
3. A `jsonb` copy of evidence, if the web app needs to search inside it. [L10]
4. Rulebook version tags in git, if re-scoring under an older rulebook is ever wanted. [L8]

## Notes

- The spec's Postgres is kept: Supabase is hosted Postgres. The user chose supabase-js over a direct connection knowing it gives up the transaction and needs paging to read past 1,000 rows. [L3] [L4]
- `audit.status` and the read-back count check replace the transaction's guarantee. Only `done` means complete. [L5]
