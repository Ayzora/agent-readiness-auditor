---
type: Work Item
title: "Section B skeleton, text coverage, and redirect findings"
parent: ../spec.md
status: todo
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

- [ ] `scraper/src/section-b/index.ts` exports `runSectionBAudit(snapshot, interactions): Finding[]`.
- [ ] **`runSectionBAudit` is synchronous, not `async`.** Making it `async` would silently permit I/O back into Phase 2 and destroy the Test Seam.
- [ ] No file under `section-b/` imports `got-scraping`, `playwright`, `crawlee`, `fetch`, or any other network capability.
- [ ] `render.text_coverage` computes raw ÷ rendered character length, both produced by the shared `extractText`.
- [ ] The reported ratio is clamped to `[0, 1]`; the unclamped value is preserved in evidence, since a ratio above 1 (JS removing SSR content) is itself signal.
- [ ] A zero denominator yields `null` — never `0` and never `NaN` — and emits its own separate finding, because an empty rendered page is a different problem with different remediation.
- [ ] Evidence on every finding carries the measured values the verdict rests on (e.g. `rawChars`, `renderedChars`, `ratio`).
- [ ] Thresholds are named constants in one place per check, not inline literals.
- [ ] A JavaScript-only redirect, raw/browser halves finishing at different addresses, and a redirect to the homepage each emit a finding.
- [ ] A redirect chain of 3+ hops emits a low-severity finding.
- [ ] **A plain single-hop redirect emits no finding.**
- [ ] `pnpm lint` passes.

## Covers

- User Stories: 1, 4
- Requirements: 11, 25-28, 32-33
- Interview Ledger: L1, L2, L4, L8, L9

## Blocked by

- `01-text-extraction-and-finding-types.md`
- `02-page-snapshot-capture-layer.md`
