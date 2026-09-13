---
type: Work Item
title: "Section B static DOM checks"
parent: ../spec.md
status: done
---

## What to build

The Section B checks that are pure over the rendered DOM alone, needing no interaction capture. Each is a pure function returning a `Finding` with the numbers behind its verdict in `evidence`.

| Check | pass | warn | fail | skip |
| --- | --- | --- | --- | --- |
| `render.hidden_but_present` | < 10% hidden | ≥ 10% | *never* | no rendered DOM |
| `render.canvas_content` | no canvas | canvas + adequate text | canvas + very little text | — |
| `render.images_missing_alt` | < 10% | 10–40% | > 40% | no images |
| `render.iframe_primary_content` | none | same-origin iframe, substantial text | iframe holds more text than the page | — |

## Required context

- **`render.hidden_but_present` can never return `fail`.** An agent parsing HTML reads that content fine, and failing a site for it would be dishonest. It becomes more serious in Phase 2, when the agent drives a browser and *would* be blocked by a collapsed accordion. Hence: report it, weight it low, never fail on it.
- The hidden-but-present percentage comes from the interaction probe's zero-click measurement (CSS-visible text vs full DOM text) — it is the one interaction-capture field that requires no clicking, so this check reads it if present and returns `skip` when there is no rendered DOM.
- **`alt=""` counts as a pass, not a miss.** Empty alt is the correct markup for a decorative image; only images with no `alt` attribute at all count against the site. Most tools get this wrong and generate noise.
- Thresholds are named constants in one place per check, asserted rather than derived, ready to lift into `criteria.yaml` at build step 2.
- These are pure functions in `section-b/`; no network code of any kind belongs in this folder.

## Acceptance criteria

- [x] `render.hidden_but_present`, `render.canvas_content`, `render.images_missing_alt` and `render.iframe_primary_content` each emit a `Finding` from `runSectionBAudit`.
- [x] Every one is a pure function over the snapshot — no `await`, no network, no browser.
- [x] **`render.hidden_but_present` returns `pass`, `warn` or `skip` and has no code path that returns `fail`.**
- [x] `render.images_missing_alt` counts `alt=""` as a pass and only counts images with no `alt` attribute at all as misses.
- [x] `render.images_missing_alt` returns `skip` when the page has no images.
- [x] Each check's evidence carries the counts and proportions behind its verdict.
- [x] Thresholds are named constants, not inline literals.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 2, 4
- Requirements: 33-35
- Interview Ledger: L7, L9

## Blocked by

- `04-section-b-skeleton-text-coverage-redirects.md`

## Summary

Completed 2026-09-13. Section B's four static DOM checks, all pure functions over
a captured `PageSnapshot`, plus a reorganisation of `section-b/` into one file per
work item.

**Built**

- `scraper/src/section-b/static-dom-checks.ts` — `hiddenButPresent`,
  `missingImagesAlt`, `canvasContent` and `iframePrimaryContent`, with
  `declaredPixels`, `declaredSize` and `frameOrigin` as private helpers. All four
  are wired into `runSectionBAudit`.
- `scraper/src/section-b/text-coverage-and-redirects.ts` — work item 04's
  `text-coverage.ts` and `redirect-findings.ts` merged unchanged in behaviour.

**Decisions taken while building**

- `render.hidden_but_present` reads `interactions.hidden`, the one interaction
  field needing no clicks. Missing interactions, a failed render and a
  zero-character DOM are three separate `skip` reasons, distinguished in evidence
  rather than collapsed.
- `render.images_missing_alt` tests `hasAttribute("alt")`, never the `.alt`
  property: the property normalises a missing attribute and `alt=""` to the same
  empty string, which is why most tools cannot tell "author forgot" from "author
  marked it decorative". Verified against linkedom.
- `render.canvas_content` needs **two** conditions to fail — thin page **and** a
  canvas declaring at least 400x300. Presence alone was flagging fingerprinting
  pixels, offscreen measurement canvases and confetti effects on short pages,
  where the page is thin for reasons `render.text_coverage` already reports.
- `render.iframe_primary_content` **infers**, because Phase 1 does not capture
  frame text and Phase 2 may not fetch it. The work item's `fail` — "iframe holds
  more text than the page" — is not computable from the snapshot, so parent-page
  thinness became the discriminator and origin the modifier: a thin page wrapped
  around a full-sized frame fails at any origin (hosted help centres and embedded
  docs are cross-origin), a same-origin frame on a text-rich page warns, and a
  third-party embed on a text-rich page passes rather than flagging every video
  on the web.
- Declared iframe dimensions are read as pixels *or* percentages, since a
  full-bleed frame is `width="100%"` and `parseInt` alone reads that as 100
  pixels. Canvas and iframe share the HTML spec's 300x150 default
  (`EMBED_DEFAULT_WIDTH` / `_HEIGHT`).
- Size tests on both canvas and iframe are proxies: CSS can scale either to any
  size, and the declared attributes only separate an app surface from a 1x1
  tracker. Evidence carries every element's measured size so the inference can be
  checked.

**Follow-ups recorded, not done**

- Capture each frame's text via `page.frames()` in `page-snapshot.ts` so
  `render.iframe_primary_content` observes rather than infers.
- Capture `getBoundingClientRect()` during the interaction probe so the canvas
  and iframe size tests use real layout instead of declared attributes.
- A content-bearing image deliberately marked `alt=""` is invisible to both the
  agent and this check. Detecting it needs rendered dimensions or byte size, and
  belongs in a separate lower-confidence check, not folded into
  `render.images_missing_alt`.
- `section-b/` parses the rendered HTML once per check. A single shared parse
  threaded through the section would remove four redundant walks.

**Verification** — `pnpm lint` passes. Each check was exercised against
hand-built HTML covering its pass, warn, fail and skip paths. Manual CLI
verification belongs to work item 09.
