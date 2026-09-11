---
type: Work Item
title: "Text extraction and finding types"
parent: ../spec.md
---

## What to build

One shared text extractor and the `Finding` shape that every Section B check returns.

Add `linkedom` as a direct dependency of `scraper` and create `extractText(html: string): string`. The same function is applied to **both** sides of every comparison in this feature — the raw/rendered ratio and Section A's baseline mismatch — so that a ratio never partly measures the parser.

Add the finding types to `scraper/src/types.ts`: a `Finding` of shape `{ criterionKey, url, status, evidence }` and a `FindingStatus` of `pass | fail | warn | skip`. Weight, severity, title and fix text are deliberately absent — those come from the rulebook (`criteria.yaml`, build step 2), so nothing here is blocked on it not existing yet.

## Required context

- `linkedom` is already in the pnpm store via Crawlee, but pnpm isolates by default, so it must be declared in `scraper/package.json`.
- Criterion keys use the **dimension**, not the section folder: `render.text_coverage`, never `section-b.*`. See `GLOSSARY.md`.
- `evidence` carries the measured values the verdict rests on, so a report can state "812 characters without JavaScript, 9,440 with" rather than only "fail".
- Example finding: `{ criterionKey: "render.text_coverage", url: "…/pricing", status: "fail", evidence: { rawChars: 812, renderedChars: 9440, ratio: 0.086 } }`
- Scraper relative imports use literal `.ts` extensions.

## Acceptance criteria

- [x] `linkedom` is declared in `scraper/package.json` dependencies and installed.
- [x] `extractText(html: string): string` exists in its own module and is exported for use by both `section-b/` and `section-a/`.
- [x] Extraction strips `<script>`, `<style>`, `<noscript>`, `<template>`, `<svg>` and HTML comments before reading text.
- [x] Whitespace runs collapse to a single space and the result is trimmed.
- [x] Extraction is `textContent`-style. `innerText` is not used on either side of any comparison.
- [x] Length is counted in characters, not words — no tokenizer, no CJK special case.
- [x] `Finding` and `FindingStatus` are declared in `scraper/src/types.ts`, with `status` limited to `pass` / `fail` / `warn` / `skip`.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 4
- Requirements: 20-24, 29-31
- Interview Ledger: L2, L8

## Blocked by

None - ready to start
