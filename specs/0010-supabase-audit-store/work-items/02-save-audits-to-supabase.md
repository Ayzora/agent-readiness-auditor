---
type: Work Item
title: Save every audit to Supabase and read it back
parent: ../spec.md
status: todo
---

## What to build

Every `pnpm scraper <url>` run saves its audit to Supabase through `@supabase/supabase-js`, reads it back, and builds its Scorecard and report from the rows read back. Saving is never fatal.

- **Tables:** `supabase/migrations/0001_audits.sql` at the repo root creates `site`, `audit` and `finding` exactly as Spec requirements 2–8 list them. It includes `json` (not `jsonb`) for `finding.evidence` and `audit.coverage`, check constraints on both `status` columns, the foreign keys, indexes on `finding (audit_id, id)` and `audit (site_id, created_at desc)`, and RLS enabled on all three tables with no policies.
- **Settings:** `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as placeholders in `scraper/.env.example`. `--env-file-if-exists=.env` added to the scraper's `start` script. `@supabase/supabase-js` added as a scraper dependency.
- **Store:** `scraper/src/audit-store.ts` holds every supabase-js call and never throws. It returns the saved id and read-back rows, or a reason. The pure conversions (`Finding` ↔ row, coverage ↔ `coverage` JSON) sit beside it with no Supabase import.
- **Host:** export `bareHost` from `site-sample.ts`, confirm it lower-cases, and use it for `site.host`. An existing host reuses its row, and `site.created_at` is never overwritten.
- **Save order:** site → audit (`running`, with `typed_url`, `ruleset_version`, `coverage` and `created_at` set to the run's date) → findings in batches of 500, in collection order → `done` → read back ordered by `id`, paging past 1,000 rows with `.range()` → compare the counts.
- **Output:**
  - On success, print `Audit <id> saved.` before the Scorecard, build the Scorecard and report from the read-back findings and coverage, and end the report's date line with ` · audit <id>`.
  - On any failure (network, insert, count mismatch), try to set the audit to `failed` if it exists, print `Audit not saved — <reason>.`, and build from memory.
  - Missing settings print `Audit not saved — no Supabase settings in scraper/.env.`, or name the one missing setting.
- The exit code never changes because of the save.

## Required context

- Spec requirements 1–28, Technical Decisions 1–3 and 5–8, and Testing Strategy 1–3.
- One `Date` is taken for the run and used for both `audit.created_at` and the report header, because `--audit` later prints that date.
- A run that stops with "No audit produced." saves nothing.
- The secret key must never appear in any printed reason or in the report. Build reasons from error messages, never from the settings.
- `renderReport` gains an optional audit id. With none, its output is exactly today's.
- The save sits after every section and before `scoreFindings`. It is Phase 1 I/O in a root module, so it must not live in a section folder.

## Acceptance criteria

- [ ] `0001_audits.sql` applies cleanly in the Supabase SQL editor and creates the three tables with RLS on and no policies.
- [ ] A run on a site with a sitemap prints `Audit <id> saved.`. Its `audit` row is `done`, its coverage stores template sizes and no URL lists, and its finding count equals the run's.
- [ ] The report of a saved run shows ` · audit <id>` on its date line. The report of an unsaved run is unchanged from today.
- [ ] A fallback-coverage run (no usable sitemap) saves `{ "kind": "fallback", "reason": … }`.
- [ ] Auditing `https://www.<host>` and then `https://<host>` leaves one `site` row.
- [ ] With neither setting, the run prints the no-settings line, and its exit code and report are unchanged. With one setting, the line names the missing one.
- [ ] With a wrong secret key, the run prints `Audit not saved — <reason>.`, and the key appears nowhere in the output.
- [ ] Reading any of the three tables through the API with the publishable key returns nothing.
- [ ] A 40-page audit with over 1,000 findings reads back the same count it inserted.
- [ ] An automated test shows `www.example.com`, `WWW.Example.com` and `example.com` give one host, and `shop.example.com` a different one.
- [ ] No automated test touches Supabase. `pnpm lint` and `pnpm --filter scraper test` pass.

## Covers

- User Stories: 1, 2, 5, 6, 7
- Requirements: 1-28
- Technical Decisions: 1-3, 5-8
- Testing Strategy: 1-4 (hand checks 1, 2, 4 save half, 5, 6, 7, 10, 12)
- Interview Ledger: L1, L2, L3, L4, L5, L6, L7, L9, L10, L11, L12

## Blocked by

- 01-template-size-in-coverage.md
