---
type: Work Item
title: "CLI wiring and CLAUDE.md amendment"
parent: ../spec.md
status: done
---

## What to build

Wire the whole thing together at the CLI, and amend CLAUDE.md so the deliberate divergence reads as a decision rather than drift.

`scraper/src/index.ts` captures **once** and hands the result to both sections: `runSectionAAudit(url, snapshot)` and `runSectionBAudit(snapshot, interactions)`. Running `pnpm scraper <url>` prints Section A's existing output plus a list of Section B findings, each carrying the measured values it was judged on.

CLAUDE.md currently records `runSectionAAudit(url)` as the pattern every section follows, and states that Section B should hold "Phase 1 fetch probes and Phase 2 check functions as separate files inside it". Both are deliberately not true of Section B, and left unamended this reads as drift.

Then verify manually.

## Required context

- CLAUDE.md needs to record: page-scope Phase 1 capture lives outside the section folders (`page-snapshot.ts`, `interaction-probe.ts`); `section-b/` holds only pure check functions; `runSectionXAudit(url)` is the shape for **site-scope** sections only; and `runSectionBAudit` is synchronous on purpose, because a function that cannot `await` cannot fetch.
- The root `index.ts` still never reaches into a section's internal files — it imports one aggregating function per section.
- **Verification is manual by explicit decision.** Run `pnpm scraper <url>` against a JavaScript-heavy site and a server-rendered site and confirm the ratios differ in the expected direction. Do not add a test runner, test dependencies, or committed fixtures.
- **Known debt, recorded rather than fixed:** deleting `humanCrawler` removes the duplicate render, but Section A and Section B still both run against the same single URL today. When the crawler lands at build step 4, capture happens once per page and is shared — no change needed then.
- Open, non-blocking: how findings print to the terminal (grouped by status, or flat) is unsettled — pick the more readable of the two. The CLI accepting flags beyond the URL is out of scope.

## Acceptance criteria

- [x] `scraper/src/index.ts` performs the page capture once and passes the result to both `runSectionAAudit` and `runSectionBAudit`.
- [x] The root `index.ts` imports only each section's aggregating entry point, not its internal files.
- [x] `pnpm scraper <url>` prints Section A's existing output plus the Section B findings, with each finding's evidence visible.
- [x] A page whose capture failed prints its findings as `skip` rather than crashing the run.
- [x] CLAUDE.md is amended to record that page-scope Phase 1 capture lives outside the section folders, that `section-b/` contains only pure checks, and that `runSectionBAudit` is synchronous by design.
- [x] CLAUDE.md's "when Section B is built, follow the same shape" guidance is corrected rather than left contradicting the code.
- [x] Manually verified: `pnpm scraper <url>` against a JavaScript-heavy site and a server-rendered site produces text coverage ratios that differ in the expected direction.
- [x] No test runner, test dependencies, committed fixtures, or `snapshots/` directory are added.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 1, 5
- Requirements: 40
- Testing Strategy: manual verification via `pnpm scraper <url>`; `pnpm lint` passes
- Interview Ledger: L12

## Blocked by

- `02-page-snapshot-capture-layer.md`
- `03-interaction-capture.md`
- `04-section-b-skeleton-text-coverage-redirects.md`
- `08-section-a-baseline-correction.md`

## Summary

Completed 2026-09-15. The CLI that runs the whole feature, and the CLAUDE.md
amendments that make Section B's divergence from Section A read as a decision.

**Built**

- `scraper/src/index.ts` — captures once via `capturePageWithInteractions`,
  probes soft 404s once at site scope, then hands the result to
  `runSectionAAudit(url, snapshot)` and
  `runSectionBAudit(snapshot, interactions, soft404)`.
- `scraper/src/print-report.ts` — all terminal output, kept out of `index.ts`.
  Findings print grouped by status, worst first, each with its evidence on the
  line below.
- CLAUDE.md — a new "Two section shapes, on purpose" section replacing the
  "follow the same shape" guidance, a Section B section, and corrections to the
  stale `humanCrawler` and `runSectionAAudit(url)` references.
- `docs/scoring-pipeline.md` — the criterion-key list was three work items
  stale; the four keys from work items 06 and 07 added.

**Decisions taken while building**

- **Findings print grouped by status, fail → warn → skip → pass.** The open
  question in the work item. The output is a work queue, and a flat list buries
  the two findings that matter under the eight that do not.
- **Each stage prints as it finishes** rather than everything at the end, so a
  stage that throws cannot take the stages that already succeeded with it.
- **The `runSectionAAudit` call is wrapped in `try`/`catch` at the CLI.**
  Discovered during verification: against an unreachable host the run *crashed*
  with an uncaught `RequestError` out of `rate-limit-probe.ts`, failing this
  work item's dead-page criterion. Section A's probes predate the never-throw
  discipline `page-snapshot.ts` follows, and fixing them is explicitly out of
  scope for this spec — so the throw is contained at the boundary instead, and
  recorded in CLAUDE.md as debt rather than silently absorbed.
- **Section A's output is printed through `util.inspect` with
  `maxStringLength: 200`.** Its shape is unchanged; only the printing is cut.
  `uaProbeResults` carries a full page of HTML per agent, and sixteen of those
  make the Section B findings underneath them unfindable.
- **A missing URL argument exits 1 with a usage line** instead of calling
  `capturePage(undefined)`.
- The work item's `runSectionBAudit(snapshot, interactions)` signature predates
  work item 07, which added the `soft404Probe` parameter. The CLI passes all
  three.

**Verified**

- `pnpm lint` passes.
- Two local fixture pages — one server-rendered, one client-rendered from an
  empty shell plus a `__NEXT_DATA__` payload — gave ratio `1.0` and `0.0`. The
  payload did not inflate the raw side, confirming `<script>` stripping.
- Real sites, the direction this check exists to measure:
  `en.wikipedia.org/wiki/Web_crawler` → `0.992` (pass, 47,936 raw chars of
  48,311); `web.telegram.org/k/` → `0.0` (fail, 0 raw chars of 207, and
  `renderSettled: load-timeout`). Telegram also failed `render.canvas_content`
  on a 1280x720 canvas beside 207 characters of text — both of that check's
  conditions, as designed.
- An unreachable host returns all ten findings as `skip` with five distinct
  reasons, exit code 0, no crash.
- No test runner, test dependencies, committed fixtures or `snapshots/`
  directory were added; the fixture server lived in a scratch directory.

**Follow-ups recorded, not done**

- Section A's probes should adopt the never-throw discipline, removing the
  `try`/`catch` the CLI now needs. Belongs with the deferred decision on
  migrating them off Crawlee.
- Crawlee's `INFO` logging from Section A floods stderr on every run. Harmless
  — stdout stays clean — but it buries the report when both streams go to a
  terminal.
- Section A still prints as a bespoke object rather than findings; it converts
  at build step 2 when the rulebook lands.
