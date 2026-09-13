---
type: Work Item
title: "Section B skeleton, text coverage, and redirect findings"
parent: ../spec.md
status: done
---

## What to build

Section B's entry point and its headline check.

`scraper/src/section-b/index.ts` exports `runSectionBAudit(snapshot: PageSnapshot, interactions: InteractionCapture | null): Finding[]`. **The function is synchronous.** A function that cannot `await` cannot fetch — the signature enforces the no-I/O-in-Phase-2 rule rather than a comment requesting it. This is the Test Seam this whole feature creates, and it must not be compromised.

`section-b/` contains **only** pure check functions and no network code whatsoever. The pattern CLAUDE.md currently records — Phase 1 probes and Phase 2 checks together inside a section folder — applies to Section A but deliberately not to Section B.

Implements two things:

1. **`render.text_coverage`** — raw text length ÷ rendered text length, both via `extractText`. The most quotable per-page number in the product: does the page's content exist without JavaScript?
2. **Redirect findings** — the capture layer recorded the facts; this decides which are findings.

## Required context

- Thresholds live as named constants in one place per check, ready to lift into `criteria.yaml` at build step 2. They are **asserted, not derived**, and are expected to be wrong at first. The principle underneath: *could an agent reading only HTML still answer a basic question about this page?*
- `render.text_coverage`: pass at ratio ≥ 0.6, warn at 0.3–0.6, fail below 0.3, skip when the render failed or rendered text is 0.
- Only three redirect shapes are flagged, and only these three: a JavaScript-only redirect (the raw response is a page but JS moves you to the real one, so an agent never arrives); the raw and browser halves finishing at different addresses (the ratio would compare unrelated pages, so flag instead of reporting a meaningless number); and a redirect to the homepage in place of the requested page, which is a soft 404 in disguise. A chain of 3 or more hops is recorded as a low-severity finding.
- Most redirects are healthy and universal — `http`→`https`, trailing slashes, locale prefixes — and flagging them all would bury the real findings.
- `skip` means the check **could not run** and is excluded from scoring entirely — not counted as a pass, which inflates, and not as a fail, which defames.
- Criterion keys use the dimension: `render.text_coverage`, never `section-b.*`.

## Acceptance criteria

- [x] `scraper/src/section-b/index.ts` exports `runSectionBAudit(snapshot, interactions): Finding[]`.
- [x] **`runSectionBAudit` is synchronous, not `async`.** Making it `async` would silently permit I/O back into Phase 2 and destroy the Test Seam.
- [x] No file under `section-b/` imports `got-scraping`, `playwright`, `crawlee`, `fetch`, or any other network capability.
- [x] `render.text_coverage` computes raw ÷ rendered character length, both produced by the shared `extractText`.
- [x] The reported ratio is clamped to `[0, 1]`; the unclamped value is preserved in evidence, since a ratio above 1 (JS removing SSR content) is itself signal.
- [x] A zero denominator yields `null` — never `0` and never `NaN` — and emits its own separate finding, because an empty rendered page is a different problem with different remediation.
- [x] Evidence on every finding carries the measured values the verdict rests on (e.g. `rawChars`, `renderedChars`, `ratio`).
- [x] Thresholds are named constants in one place per check, not inline literals.
- [x] A JavaScript-only redirect, raw/browser halves finishing at different addresses, and a redirect to the homepage each emit a finding.
- [x] A redirect chain of 3+ hops emits a low-severity finding.
- [x] **A plain single-hop redirect emits no finding.**
- [x] `pnpm lint` passes.

## Covers

- User Stories: 1, 4
- Requirements: 11, 25-28, 32-33
- Interview Ledger: L1, L2, L4, L8, L9

## Blocked by

- `01-text-extraction-and-finding-types.md`
- `02-page-snapshot-capture-layer.md`

## Summary

Completed 2026-09-13. Section B's entry point and its first two check families, all
pure functions over a captured `PageSnapshot`.

**Built**

- `scraper/src/section-b/index.ts` — synchronous `runSectionBAudit(snapshot, interactions): Finding[]`.
  `interactions` is accepted but unread until the interaction-dependent checks land.
- `scraper/src/section-b/text-coverage.ts` — `render.text_coverage` (raw ÷ rendered
  characters, clamped to `[0, 1]` with the unclamped value kept in evidence) and
  `render.empty_rendered_page`.
- `scraper/src/section-b/redirect-findings.ts` — `render.js_redirect`,
  `render.halves_diverged`, `render.homepage_redirect` and
  `render.long_redirect_chain`, plus `pathOf`, `originOf` and `sameAddress` helpers.

**Decisions taken while building**

- Both sides of the ratio are extracted inside the check rather than read from
  `snapshot.domText`, so a stored snapshot can never be scored by comparing two
  versions of the extractor.
- A zero denominator returns `ratio: null` and `skip`. The two causes are kept
  apart: a failed capture is ours (`skip`), an empty render is the site's (`fail`).
- Redirect checks stay silent when nothing is wrong — only the four named shapes
  emit findings, and a plain single-hop redirect emits none.
- `render.js_redirect` is **inferred** (no server hops, yet the browser moved),
  not observed. Evidence carries both URLs so the inference can be checked.
- URL comparison normalises the trailing slash and ignores query and fragment,
  trading a rare false negative for far fewer false positives.

**Follow-ups recorded, not done**

- Record browser-side navigation in `page-snapshot.ts` so `render.js_redirect`
  observes rather than infers.
- Decide whether `render.text_coverage` should skip when `render.halves_diverged`
  fires, since the ratio then compares two different pages.
- `snapshot.domText` is a derived value no check reads any more — candidate for removal.

**Verification** — `pnpm lint` passes. Manual CLI verification belongs to work item 09.
