---
type: Work Item
title: Extraction ratio check
parent: ../spec.md
status: done
---

## What to build

Add `scraper/src/section-c/extraction-ratio.ts`: a synchronous, pure `structure.extraction_ratio` check over `snapshot.rawHtml` and the rulebook. It returns a `Finding` measuring how much of the raw page's text Readability keeps as main content.

Add its `criteria.yaml` entry. Confirm `@mozilla/readability` is declared in `scraper/package.json`, and commit the product spec §3 C and `GLOSSARY.md` edits made during the interview.

This item does not wire the check into the CLI; Work Item 04 does.

## Required context

- `scraper/src/extract-text.ts` — the shared extractor for the "all text" side, and the whitespace normalisation the readable side must match.
- `scraper/src/utils.ts` — `skipped()` and `thresholdsFor()`. Thresholds are read once at the top: `const { fail, warn } = thresholdsFor(rulebook, CRITERION)`.
- `scraper/src/section-b/text-coverage-and-redirects.ts` — the existing ratio check to mirror in shape.
- Readability mutates the document it parses: give it its own `parseHTML(rawHtml)` document.
- Readability is built for `jsdom`. If it misbehaves on `linkedom`, add `jsdom` for this one check rather than changing the shared extractor (Spec Technical Decisions).
- `@mozilla/readability` `^0.6.0` is already in `scraper/package.json` and `pnpm-lock.yaml`, uncommitted, at Spec time. `GLOSSARY.md` (Extraction ratio term) and `agent-readiness-auditor-spec.md` §3 C are also uncommitted.

## Acceptance criteria

- [x] `section-c/extraction-ratio.ts` exports a synchronous check taking `(snapshot: PageSnapshot, rulebook: Rulebook)` and returning a `Finding` with `criterionKey: "structure.extraction_ratio"`.
- [x] It reads only `snapshot.rawHtml`; nothing in the file references `renderedHtml`.
- [x] Readable text comes from `@mozilla/readability` on a freshly parsed `linkedom` document, whitespace-collapsed and trimmed.
- [x] All text is `extractText(snapshot.rawHtml)`.
- [x] `ratio = readableChars ÷ rawChars`, clamped to at most 1.
- [ ] Verdicts in order: `rawHtml` null → `skip` with `reason: "raw fetch failed"`; `rawChars` 0 → `fail` with `ratio: null`; no article → `fail` with `ratio: 0`, `readabilityFound: false`; `ratio < fail` → `fail`; `ratio < warn` → `warn`; otherwise `pass`.
- [x] Every non-skip finding's evidence has `ratio`, `readableChars`, `rawChars`, `readabilityFound`.
- [x] No threshold number appears in the file; `fail` and `warn` come from `thresholdsFor`.
- [x] `criteria.yaml` has a `structure.extraction_ratio` entry: `dimension: structure`, `scope: page`, weight 6, severity high, effort M, thresholds `fail: 0.25` and `warn: 0.5`, and the title/why/fix from Spec Requirement 24.
- [x] `@mozilla/readability` is a declared dependency of `scraper`, committed with the lockfile.
- [x] `GLOSSARY.md` and `agent-readiness-auditor-spec.md` §3 C edits are committed.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 1, 2, 6
- Requirements: 1-13, 22-25, 30
- Interview Ledger: L1, L2, L3, L5

## Blocked by

None - ready to start
