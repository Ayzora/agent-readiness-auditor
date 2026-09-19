---
type: Work Item
title: Test setup and Section C tests
parent: ../spec.md
status: done
---

## What to build

The scraper's first automated tests. The setup is shared by every section:

- a `test` script in `scraper/package.json` running Node's built-in `node --test` over `src/**/*.test.ts`;
- a shared helper that builds a `PageSnapshot` from an HTML string.

Using that setup, write fake-HTML tests for both Section C checks. Test cases for Sections A and B are a Spec Follow-Up, not part of this item.

## Required context

- Test Seam: check functions are synchronous and pure over a `PageSnapshot` and a `Rulebook`. Tests call the check functions directly; no network, no browser.
- Load the real rulebook with `loadRulebook()` from `scraper/src/rulebook.ts`, so a threshold renamed in `criteria.yaml` but not in code fails loudly. Place fixtures clearly on one side of each cutoff so tuning a threshold value does not break tests.
- `PageSnapshot` shape is in `scraper/src/types.ts`; the helper fills the non-HTML fields with neutral defaults.
- Node runs `.ts` directly via type stripping; relative imports use real `.ts` extensions (`CLAUDE.md`, "Scraper module resolution").
- Helper location is not fixed by the Spec: put it at the `scraper/src` root (not inside a section folder), since every section will import it.

## Acceptance criteria

- [ ] `pnpm --filter scraper test` runs `node --test` over `src/**/*.test.ts` and exits non-zero on a failing test.
- [ ] No test framework dependency is added.
- [ ] A shared helper outside any section folder builds a `PageSnapshot` from a `rawHtml` string (and optional overrides, including `rawHtml: null`).
- [ ] Test files live beside the code as `scraper/src/section-c/*.test.ts`.
- [ ] Extraction ratio cases: content-heavy article → `pass`; chrome-heavy page → `fail`; `rawHtml: null` → `skip` with `"raw fetch failed"`; raw HTML with no text → `fail` with `ratio: null`.
- [ ] Link navigation cases: `<a href="/pricing">` counted followable; `<a href="#">`, `<a href="javascript:void(0)">`, `<span role="link">` and `<div onclick="location.href='/x'">` counted unfollowable; `href="#pricing"` and a plain `<button>` ignored; no followable links → `fail`; share above 30% → `fail`; above 10% → `warn`; `rawHtml: null` → `skip`; `examples` capped at 5.
- [ ] All tests pass, and `pnpm lint` passes.

## Covers

- User Stories: 5
- Requirements: 32-36
- Testing Strategy: fake-HTML tests over the pure check Test Seam with the real rulebook
- Interview Ledger: L6

## Blocked by

- 01-extraction-ratio-check.md
- 02-link-navigation-check.md
