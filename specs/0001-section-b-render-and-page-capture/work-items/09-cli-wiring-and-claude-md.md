---
type: Work Item
title: "CLI wiring and CLAUDE.md amendment"
parent: ../spec.md
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

- [ ] `scraper/src/index.ts` performs the page capture once and passes the result to both `runSectionAAudit` and `runSectionBAudit`.
- [ ] The root `index.ts` imports only each section's aggregating entry point, not its internal files.
- [ ] `pnpm scraper <url>` prints Section A's existing output plus the Section B findings, with each finding's evidence visible.
- [ ] A page whose capture failed prints its findings as `skip` rather than crashing the run.
- [ ] CLAUDE.md is amended to record that page-scope Phase 1 capture lives outside the section folders, that `section-b/` contains only pure checks, and that `runSectionBAudit` is synchronous by design.
- [ ] CLAUDE.md's "when Section B is built, follow the same shape" guidance is corrected rather than left contradicting the code.
- [ ] Manually verified: `pnpm scraper <url>` against a JavaScript-heavy site and a server-rendered site produces text coverage ratios that differ in the expected direction.
- [ ] No test runner, test dependencies, committed fixtures, or `snapshots/` directory are added.
- [ ] `pnpm lint` passes.

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
