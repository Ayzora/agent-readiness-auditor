---
type: Work Item
title: Store template size instead of the URL list
parent: ../spec.md
status: todo
---

## What to build

A small preparatory refactor with no database. Everything that prints a template's size reads a `size` instead of `template.urls.length`, so the same printers can later render coverage read back from Supabase, which stores each template's size but not its URL list.

- The report's Coverage part (`scraper/src/report.ts:79`).
- The terminal's Pages block (`scraper/src/print-report.ts:46` and `:64`).
- `templateBreakdown` (`scraper/src/site-sample.ts:190`).

Define the stored coverage shape — `ReportCoverage` with each template as `{ label, size, sampled }` — and make these printers take it. Sampling itself (`sampleSite`) keeps its full `urls` lists, because it needs them to choose pages. Terminal output and the report's text must not change.

## Required context

- After sampling, the only use of `template.urls` is its length. Every other read is inside `sampleSite`.
- The `"sample"` coverage shape holds `kind`, `sitemapUrl`, `eligibleCount`, `templates` (largest first), `templatesLeftOut`, `pages`, `audited`, `unreachable` and `notCaptured`. The `"fallback"` shape holds `kind` and `reason`.
- `renderReport` stays pure.

## Acceptance criteria

- [ ] A coverage type exists whose templates carry `size: number` and no `urls`.
- [ ] `renderReport`, the Pages block and `templateBreakdown` read a template's size from that shape. None of them reads `template.urls`.
- [ ] `sampleSite` still returns templates with their full `urls` lists, and `index.ts` converts to the stored shape before printing.
- [ ] A `pnpm scraper <url>` run prints the same Pages block, Fix first template lines and report text as before the change.
- [ ] `pnpm lint` and `pnpm --filter scraper test` pass, with existing tests updated only where they build the changed shape.

## Covers

- Requirements: 9-11
- Technical Decisions: 4
- Testing Strategy: 4
- Interview Ledger: L6

## Blocked by

None - ready to start
