---
type: Work Item
title: pnpm scraper --audit <id>
parent: ../spec.md
status: todo
---

## What to build

`pnpm scraper --audit <id>` rebuilds a saved audit's Scorecard and report from Supabase alone, under today's `criteria.yaml`, without contacting any website and without writing to Supabase.

- **Arguments:** `index.ts` currently treats the first argument not starting with `--` as the URL. Change that so the `42` in `--audit 42` is never read as a URL. `--audit` together with a URL, `--audit` with no id, or an id that isn't a positive integer is a usage error with a non-zero exit.
- **Read:** the audit's `site`, `audit` and `finding` rows through `audit-store.ts`, with findings ordered by `id` and paged past 1,000 rows.
- **Stop cases:** one line, a non-zero exit, no Scorecard, no report:
  - `No audit 42.`
  - `Audit 42 is <status> — its findings are incomplete, so no scorecard.` (any status but `done`)
  - missing settings, named as in Work Item 02
  - `Could not read audit 42 — <reason>.`
  - `Audit 42 has findings for <key>, which criteria.yaml no longer defines.`, checked before `scoreFindings`, whose own throw (`scorecard.ts:50`) must not surface as a crash
- **Output:**
  - One line naming the audit, its host, its date and the rulebook.
  - Then the Scorecard and Fix first blocks exactly as a normal run prints them. No section blocks, Pages block or capture lines.
- **Rulebook version:** when `criteria.yaml`'s `version` differs from `audit.ruleset_version`, the terminal line and the report's date line read `rulebook v0.2.0 (audit ran under v0.1.0)`. Finding statuses are used as saved and never re-judged.
- **Report:** saved to `~/Downloads` under the existing rules. The header uses the audit's `created_at` and ends with ` · audit <id>`. The filename uses the audit's host and the current time.

## Required context

- Spec requirements 29–37 and Technical Decisions 8–10.
- `renderReport` gains an optional audit rulebook version. With none, or with one equal to the current version, the rulebook part is unchanged.
- The report rendered here must match the original run's report apart from the rulebook part. That depends on Work Item 01's single coverage shape and Work Item 02's `json` columns.

## Acceptance criteria

- [ ] For a `done` audit, `--audit <id>` prints the audit line, the Scorecard and Fix first, and saves a report. That report matches the original run's report in `~/Downloads` apart from the rulebook part, including evidence key order and the Coverage part.
- [ ] The same holds for an audit with fallback coverage.
- [ ] `--audit` makes no request to the audited site and writes nothing to Supabase.
- [ ] With an audit's status set to `running` in the dashboard, `--audit` refuses it with the not-complete line and a non-zero exit.
- [ ] A nonexistent id prints `No audit <id>.` and exits non-zero.
- [ ] After bumping `criteria.yaml`'s `version` locally, the terminal and the report both show `(audit ran under …)`.
- [ ] A saved finding whose key was removed from the rulebook prints the no-longer-defines line instead of a stack trace.
- [ ] `--audit` with a URL, with no id, or with `abc` is a usage error, and `pnpm scraper <url>` works as before.
- [ ] Running `--audit` twice for one audit writes two report files, and neither overwrites the other.
- [ ] `pnpm lint` and `pnpm --filter scraper test` pass.

## Covers

- User Stories: 3, 4, 5
- Requirements: 29-37
- Technical Decisions: 8-10
- Testing Strategy: 2-4 (hand checks 3, 4 rebuild half, 8, 9, 11)
- Interview Ledger: L1, L5, L8, L9, L11

## Blocked by

- 02-save-audits-to-supabase.md
