---
type: Work Item
title: "Section B interaction-dependent checks"
parent: ../spec.md
status: done
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

- [x] `render.content_behind_interaction`, `render.infinite_scroll` and `render.consent_wall` each emit a `Finding` from `runSectionBAudit`.
- [x] All three are pure functions over the passed-in capture — no `await`, no network, no browser.
- [x] When `interactions` is `null`, all three return `skip` and none returns `pass` or `fail`.
- [x] `render.content_behind_interaction` returns `skip` when no load-more-style control was found, rather than `pass`.
- [x] `render.infinite_scroll` returns `warn` when scrolling adds content but pagination exists, and `fail` when it adds content with no pagination.
- [x] `render.consent_wall` returns `warn` for a banner that gates nothing and `fail` when more than 30% of the body is gated.
- [x] Each check's evidence carries the before/after measurements behind its verdict.
- [x] Thresholds are named constants, not inline literals.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 2, 4
- Requirements: 19, 33
- Interview Ledger: L7, L9

## Blocked by

- `03-interaction-capture.md`
- `04-section-b-skeleton-text-coverage-redirects.md`

## Summary

Completed 2026-09-15. Section B's three interaction-dependent checks, all pure
functions over the `InteractionCapture` Phase 1 already collected.

**Built**

- `scraper/src/section-b/interaction-checks.ts` — `contentBehindInteraction`,
  `infiniteScroll` and `consentWall`, with `skipped`, `percentage` and
  `paginationSignals` as private helpers. All three are wired into
  `runSectionBAudit`.

**Decisions taken while building**

- `render.infinite_scroll` **infers** pagination from the rendered DOM, because
  `ScrollCapture` records three numbers and none of them is pagination — the same
  position `render.iframe_primary_content` is in. Three signals are matched:
  `rel="next"` (the `rel` attribute is split on whitespace, so `rel="noopener
  next"` matches and `rel="nextpage"` does not), an element whose id, class or
  aria-label contains `pagin`, and an anchor whose href matches `?page=N` or
  `/page/N`. Evidence carries which signals fired, so the inference can be
  checked rather than trusted.
- Scrolling needs the **same 10% growth bar** as the click check. The work item
  says only "adds content", which taken literally fires on a single character —
  and pages routinely gain a few from a lazy-loaded footer or a late-injected
  script.
- `render.consent_wall` divides by `charsAfter`, the whole body, not by the
  truncated `charsBefore`. The question is what share of the page consent was
  withholding; dividing by the smaller number reports a banner hiding most of a
  page as well over 100%. Text *shrinking* after accepting yields a negative
  share, which lands in `warn` alongside a banner that changed nothing.
- A control found but never clicked returns **`skip`, not `pass`** — on all three
  checks. The probe has a 3-click, 10-second budget and a click can bounce off an
  overlay, so "we found a Load more button and could not test it" is unknown, not
  clean. Scored as a pass it tells a site owner their page is fine when we have no
  idea, and a site whose accept button is broken would outscore one whose button
  works.
- Every `skip` carries a distinct `reason`: capture absent, budget exhausted
  before that step, no control on the page, control found but unclicked, and a
  zero denominator are five different situations and are not collapsed into one.
- `render.infinite_scroll` skips when `renderedHtml` is null, since without it
  `warn` and `fail` cannot be told apart and the check has no honest verdict.

**Verified**

- `pnpm lint` passes.
- Every branch exercised with constructed `PageSnapshot` / `InteractionCapture`
  literals through the Test Seam — no network, no browser. Uncommitted, per the
  spec's out-of-scope decision on a test suite.

**Follow-ups recorded, not done**

- Record pagination presence in `ScrollCapture` during Phase 1, where the live
  page can be observed, instead of inferring it in Phase 2 forever.
- The growth thresholds count characters only. A "Load more" that swaps one page
  of results for another adds no text and passes, though an agent still saw only
  one page. Counting repeated structure — list items, article cards — would catch
  it.
