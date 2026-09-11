---
type: Work Item
title: "Section B static DOM checks"
parent: ../spec.md
status: todo
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

- [ ] `render.hidden_but_present`, `render.canvas_content`, `render.images_missing_alt` and `render.iframe_primary_content` each emit a `Finding` from `runSectionBAudit`.
- [ ] Every one is a pure function over the snapshot — no `await`, no network, no browser.
- [ ] **`render.hidden_but_present` returns `pass`, `warn` or `skip` and has no code path that returns `fail`.**
- [ ] `render.images_missing_alt` counts `alt=""` as a pass and only counts images with no `alt` attribute at all as misses.
- [ ] `render.images_missing_alt` returns `skip` when the page has no images.
- [ ] Each check's evidence carries the counts and proportions behind its verdict.
- [ ] Thresholds are named constants, not inline literals.
- [ ] `pnpm lint` passes.

## Covers

- User Stories: 2, 4
- Requirements: 33-35
- Interview Ledger: L7, L9

## Blocked by

- `04-section-b-skeleton-text-coverage-redirects.md`
