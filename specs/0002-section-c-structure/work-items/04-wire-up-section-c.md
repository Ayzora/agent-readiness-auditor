---
type: Work Item
title: Wire up Section C
parent: ../spec.md
status: done
---

## What to build

Add `scraper/src/section-c/index.ts` exporting a synchronous `runSectionCAudit(snapshot, rulebook)` that returns both checks' findings. Call it from the root `scraper/src/index.ts` with the snapshot already captured and the loaded rulebook, and print it after Section B.

Update `CLAUDE.md` for Section C and the tests, then verify with manual runs against real sites.

## Required context

- `scraper/src/section-b/index.ts` — the aggregator shape to mirror.
- `scraper/src/index.ts` — captures once, loads the rulebook once, and imports one aggregating function per section. It must never reach into `section-c/`'s internal files.
- `CLAUDE.md` currently says "There is no test suite yet" and describes only Sections A and B; the test command comes from Work Item 03.

## Acceptance criteria

- [ ] `section-c/index.ts` exports `runSectionCAudit(snapshot: PageSnapshot, rulebook: Rulebook): Finding[]`, synchronous, returning the extraction ratio and link navigation findings.
- [ ] `section-c/` contains no network code.
- [ ] The root `index.ts` imports only `runSectionCAudit` from `section-c/` and prints its findings with `printFindings("Section C — structure", …)` after Section B.
- [ ] No change to `page-snapshot.ts`, `interaction-probe.ts` or the `PageSnapshot` type.
- [ ] `CLAUDE.md` describes Section C alongside A and B (raw HTML only, the two checks), the `pnpm scraper` row mentions Section C, and "There is no test suite yet" is replaced with how to run the tests.
- [ ] `pnpm lint` passes.
- [ ] Manual: `pnpm scraper <url>` against a content page (e.g. a news article), a JavaScript-heavy app, and a docs site each print a Section C block with two findings and verdicts that make sense for the page.

## Covers

- User Stories: 4
- Requirements: 26-29, 31
- Testing Strategy: manual `pnpm scraper <url>` verification
- Interview Ledger: L2

## Blocked by

- 01-extraction-ratio-check.md
- 02-link-navigation-check.md
