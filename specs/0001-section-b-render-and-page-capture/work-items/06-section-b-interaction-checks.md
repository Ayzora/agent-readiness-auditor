---
type: Work Item
title: "Section B interaction-dependent checks"
parent: ../spec.md
status: todo
---

## What to build

The Section B checks that read the interaction capture. Pure functions, same as the rest of `section-b/` — the clicking already happened in Phase 1.

| Check | pass | warn | fail | skip |
| --- | --- | --- | --- | --- |
| `render.content_behind_interaction` | no growth on click | — | text grew > 10% | no such control found |
| `render.infinite_scroll` | no infinite scroll | adds content, pagination exists | adds content, no pagination | — |
| `render.consent_wall` | no banner | banner present, gates nothing | > 30% of body gated | — |

This is the half of the hidden-content story that genuinely harms an agent: content absent from the DOM until something is clicked, as opposed to content merely hidden by CSS but present in the HTML.

## Required context

- `interactions` is `InteractionCapture | null`. When it is `null` — the probe failed or hung — **every check here returns `skip`**, which is excluded from scoring entirely rather than counted as a pass (inflates) or a fail (defames).
- `render.consent_wall` compares the body text captured before accepting the banner against the text captured after; the difference is what consent gated.
- `render.infinite_scroll` distinguishes "scrolling adds content and pagination links exist" (warn — an agent has another route to the content) from "scrolling adds content and there is no pagination" (fail — the content has no non-interactive route).
- Thresholds are named constants in one place per check, ready to lift into `criteria.yaml` at build step 2.
- No network code in `section-b/`, and `runSectionBAudit` stays synchronous.

## Acceptance criteria

- [ ] `render.content_behind_interaction`, `render.infinite_scroll` and `render.consent_wall` each emit a `Finding` from `runSectionBAudit`.
- [ ] All three are pure functions over the passed-in capture — no `await`, no network, no browser.
- [ ] When `interactions` is `null`, all three return `skip` and none returns `pass` or `fail`.
- [ ] `render.content_behind_interaction` returns `skip` when no load-more-style control was found, rather than `pass`.
- [ ] `render.infinite_scroll` returns `warn` when scrolling adds content but pagination exists, and `fail` when it adds content with no pagination.
- [ ] `render.consent_wall` returns `warn` for a banner that gates nothing and `fail` when more than 30% of the body is gated.
- [ ] Each check's evidence carries the before/after measurements behind its verdict.
- [ ] Thresholds are named constants, not inline literals.
- [ ] `pnpm lint` passes.

## Covers

- User Stories: 2, 4
- Requirements: 19, 33
- Interview Ledger: L7, L9

## Blocked by

- `03-interaction-capture.md`
- `04-section-b-skeleton-text-coverage-redirects.md`
