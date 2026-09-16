---
type: Work Item
title: Link navigation check
parent: ../spec.md
status: todo
---

## What to build

Add `scraper/src/section-c/link-navigation.ts`: a synchronous, pure `structure.link_navigation` check over `snapshot.rawHtml` and the rulebook. It sorts link-like elements into followable and unfollowable by markup alone and judges the unfollowable share.

Add its `criteria.yaml` entry.

This item does not wire the check into the CLI; Work Item 04 does.

## Required context

- `scraper/src/utils.ts` — `skipped()`, `percentage()` and `thresholdsFor()`.
- `scraper/src/section-b/static-dom-checks.ts` — existing `linkedom` DOM-query checks to mirror in shape.
- Script-attached handlers (`addEventListener`, framework `onClick`) are invisible in HTML. The check must not claim to detect them, and the rulebook text must not imply it (Requirement 21).
- Both this item and Work Item 01 add a `criteria.yaml` entry; expect a trivial merge if built in parallel.

## Acceptance criteria

- [ ] `section-c/link-navigation.ts` exports a synchronous check taking `(snapshot: PageSnapshot, rulebook: Rulebook)` and returning a `Finding` with `criterionKey: "structure.link_navigation"`.
- [ ] It reads only `snapshot.rawHtml`; nothing in the file references `renderedHtml`.
- [ ] Followable: `<a>` whose `href` is a real URL, relative or absolute.
- [ ] Unfollowable: `<a>` with no, empty, `#`, or `javascript:` `href`; a non-`<a>` with `role="link"`; any element whose inline `onclick` contains `location`, `href` or `window.open`.
- [ ] Each element counts at most once; an `<a>` with a real `href` is followable even with an `onclick`.
- [ ] In-page anchors such as `href="#pricing"` and `<button>`s without a navigating `onclick` are counted neither way.
- [ ] `unfollowablePercent = unfollowable ÷ (followable + unfollowable) × 100` via `percentage()`.
- [ ] Verdicts in order: `rawHtml` null → `skip` with `reason: "raw fetch failed"`; no followable links (including no link-like elements at all) → `fail`; `unfollowablePercent > fail` → `fail`; `> warn` → `warn`; otherwise `pass`.
- [ ] Evidence has `followableLinks`, `unfollowableLinks`, `unfollowablePercent` and `examples`: at most 5 entries, each a tag name plus `outerHTML` trimmed to at most 120 characters.
- [ ] No threshold number appears in the file; `fail` and `warn` come from `thresholdsFor`.
- [ ] `criteria.yaml` has a `structure.link_navigation` entry: `dimension: structure`, `scope: page`, weight 7, severity high, effort S, thresholds `fail: 30` and `warn: 10`, and the title/why/fix from Spec Requirement 24.
- [ ] `pnpm lint` passes.

## Covers

- User Stories: 3
- Requirements: 4-7, 14-25
- Interview Ledger: L2, L4

## Blocked by

None - ready to start

## Blocking decisions

None blocking. Known risk: whether percentage verdicts need a minimum link count (`min_links`, Interview Ledger L7) is undecided. Until decided, build Requirement 19 as written — percentage rules at any count. If decided later, it is a threshold plus one branch in this file.
