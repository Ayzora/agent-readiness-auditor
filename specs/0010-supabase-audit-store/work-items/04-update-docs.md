---
type: Work Item
title: Update the docs to match the audit store
parent: ../spec.md
status: todo
---

## What to build

Bring the project's documents in line with what Work Items 01–03 built.

- `agent-readiness-auditor-spec.md` §7 and §12:
  - Supabase (hosted Postgres) through supabase-js.
  - `json` rather than `jsonb` for evidence and coverage.
  - The `site` / `audit` / `finding` columns as built, including `typed_url` and `coverage`.
  - No stored scores, gate or `report_md`, and no `archetype` yet.
- `docs/scoring-pipeline.md`:
  - Steps 3 and 4 are built. Describe the insert and the read-back, and `status` in place of a transaction.
  - Step 12 is still not built.
  - Remove or correct every "there is no database" note.
- `CLAUDE.md`:
  - Replace the "there is no database" statements.
  - Add `pnpm scraper --audit <id>` to the Commands table.
  - Update the Environment files section for `SUPABASE_URL` / `SUPABASE_SECRET_KEY` and the `--env-file-if-exists=.env` start script.
  - Add a short section on the audit store: where the supabase-js calls live, never-throw, only `done` is complete, `json` for key order, RLS on with no policies, and what is deliberately not built.

## Required context

- Spec requirement 38 and its Out of Scope and Follow-Ups lists, which say what the docs must call deferred.
- Follow the existing CLAUDE.md section style (rules the code is built around, then "Deliberately not built").

## Acceptance criteria

- [ ] No document says the project has no database, or names `jsonb` or a direct Postgres connection as the current design.
- [ ] `CLAUDE.md`'s Commands table lists `pnpm scraper --audit <id>`, and its Environment files section names both Supabase settings.
- [ ] `docs/scoring-pipeline.md` marks steps 3 and 4 as built and step 12 as not built.
- [ ] Spec §7's table sketch matches `supabase/migrations/0001_audits.sql`.

## Covers

- Requirements: 38
- Interview Ledger: L12

## Blocked by

- 03-rebuild-audit-command.md
