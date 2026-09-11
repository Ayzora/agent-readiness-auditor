---
type: Work Item
title: "Interaction capture"
parent: ../spec.md
status: todo
---

## What to build

`scraper/src/interaction-probe.ts`, sitting **beside** `page-snapshot.ts` and not inside `section-b/`. It is page-scope Phase 1 work exactly as the snapshot is, and Section E will need it for forms and CAPTCHA-on-interaction.

It reuses the browser page already opened by the capture layer — a second session would make three requests per page against a budget of two, 50% more load on the audited site at 40 pages.

Two distinct measurements, deliberately separated:

- **Hidden but present**, measured with **zero clicks**, by comparing the browser's CSS-visible text against the full DOM text. An agent parsing HTML reads that content perfectly well, so clicking to reveal it would measure nothing an agent experiences.
- **Genuinely absent until interaction**, which is the only thing that justifies a click.

## Required context

- The tool exists to see what agents see, and agents do not click. Clicking is only there to *size the gap*, not to simulate a user.
- Clicking is limited to: one "Load more"-style control, the cookie consent banner, and scrolling to the bottom up to 3 times.
- The allowlist is **exhaustive** — a control is clicked only if it matches. An allowlist beats a blocklist because under a blocklist an unfamiliar button is clicked *by default*, and under-counting hidden content is a slightly wrong number while clicking "Add to cart" on a stranger's shop is a real incident.
- Consent handling: capture body text, locate the banner, accept, capture again. The difference is the content gated behind consent.
- An `InteractionCapture` type is needed in `scraper/src/types.ts` carrying what the Section B interaction checks are judged on (text before/after each action, whether a load-more control was found, whether scrolling added content, whether a banner was present and what it gated).

## Acceptance criteria

- [ ] `scraper/src/interaction-probe.ts` exists beside `page-snapshot.ts`, not inside any section folder.
- [ ] It runs on the page session already opened by the capture layer — no second browser session and no additional page load.
- [ ] Hidden-but-present content is measured with zero clicks, comparing CSS-visible text against full DOM text.
- [ ] At most 3 clicks and at most 10 seconds are spent per page; both budgets stop the probe regardless of state.
- [ ] Only allowlist-matching controls are clicked: one load-more control, the consent banner, plus up to 3 scrolls to bottom.
- [ ] **Nothing inside a `<form>` is ever clicked.**
- [ ] **No link pointing to a different URL is ever clicked.**
- [ ] **No control whose visible text matches buy / checkout / submit / pay / delete / sign up / add to cart / subscribe is ever clicked.**
- [ ] Consent handling captures body text, accepts the banner, and captures again, recording the difference.
- [ ] If interaction capture fails or hangs, the snapshot is still returned and `interactions` comes back `null`.
- [ ] `pnpm lint` passes.

## Covers

- User Stories: 2
- Requirements: 12-19
- Interview Ledger: L7, L11

## Blocked by

- `02-page-snapshot-capture-layer.md`
