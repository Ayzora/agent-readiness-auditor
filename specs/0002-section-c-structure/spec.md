---
type: Spec
title: "Section C (structure): extraction ratio and link navigation"
---

## Problem

Sections A and B answer whether an agent can get a page's bytes and whether its content exists without JavaScript. Nothing yet answers the next question: once an agent has the HTML, can it make use of it?

Two things go wrong at that point for a real agent, which fetches HTML, reduces it to text, and sometimes follows links onward:

1. **The page is mostly chrome.** Menus, footers, cookie text and sidebars are read and paid for in tokens alongside the content, and a reader-style extractor may not find the content at all.
2. **The links cannot be followed.** Navigation built from `<a href="#">`, `javascript:` URLs or inline click handlers is a dead end for an agent reading markup; every page behind it is unreachable.

The original §3 C list in `agent-readiness-auditor-spec.md` also named heading hierarchy, landmarks, tables, anchor text and a Markdown noise ratio. Most of those measure accessibility for humans rather than visibility to agents, duplicate another check, or cannot be detected reliably in raw HTML, and building them would overstate what matters.

## Proposed Outcome

A `scraper/src/section-c/` folder of pure check functions over the existing `PageSnapshot`, emitting two findings per page — `structure.extraction_ratio` and `structure.link_navigation` — judged on the **raw** HTML an agent actually receives, with every cutoff in `criteria.yaml`.

Running `pnpm scraper <url>` prints a Section C block after Section B. Section C also brings the scraper's first automated tests, built from small fake HTML pages.

## User Stories

1. As a site owner, I want to know how much of my page's text is real content versus menus and footers, so I know how much of an agent's reading is spent on chrome.
2. As a site owner, I want to be told when a reader-style extractor cannot find any main content on my page, because an agent using the same approach gets nothing useful.
3. As a site owner, I want to know which of my links an agent cannot follow, with examples I can find in my markup, so I can replace them with real links.
4. As a site owner, I want Section C to judge the HTML agents actually receive, so a page that only works after JavaScript is not reported as well structured.
5. As a developer of this tool, I want Section C's verdicts pinned by tests over fake HTML pages, so rare cases are verified without hunting for a real site that exhibits them.
6. As a developer of this tool, I want the product spec to record which structure checks were cut and why, so they are not re-proposed without new evidence.

## Requirements

### Scope

1. Section C contains exactly two checks: `structure.extraction_ratio` and `structure.link_navigation`. [L1]
2. The following are **not** built: heading hierarchy (h1 count, skipped levels, headings used for styling), semantic landmarks, descriptive anchor text, any table check (div grids, header cells, colspan, images of tables), and the Markdown conversion noise ratio. [L1] [L5]
3. `agent-readiness-auditor-spec.md` §3 C lists only the two checks, states that both read raw HTML, and records the cut items with their reason. (Already updated during the interview.) [L1] [L2] [L5]

### Input

4. Both checks read `snapshot.rawHtml` only. [L2]
5. Neither check ever falls back to `snapshot.renderedHtml`. [L2]
6. A raw page with little or no text is judged, not skipped: a JavaScript shell fails Section C as well as Section B, because that is what an agent receives. [L2]
7. When `snapshot.rawHtml` is `null`, both checks return `skip` with evidence `reason: "raw fetch failed"`. [L2] [L3] [L4]

### `structure.extraction_ratio`

8. Readable text is produced by `@mozilla/readability` run over the raw HTML parsed with `linkedom`, taking the parsed article's text content and collapsing whitespace to single spaces, trimmed — the same normalisation `extractText` applies. [L3]
9. Readability mutates the document it parses, so it runs on its own freshly parsed document, not one shared with any other extraction. [L3]
10. All text is `extractText(snapshot.rawHtml)`, the shared extractor Section B already uses. [L3]
11. `ratio = readableChars ÷ rawChars`, clamped to at most 1. [L3]
12. Verdicts, in order: [L3]
    - `rawHtml` is `null` → `skip`, `reason: "raw fetch failed"`.
    - `rawChars` is 0 → `fail`, `ratio: null`.
    - Readability returns no article → `fail`, `ratio: 0`, `readabilityFound: false`.
    - `ratio < fail` → `fail`.
    - `ratio < warn` → `warn`.
    - otherwise → `pass`.
13. Evidence on every non-skip finding: `ratio`, `readableChars`, `rawChars`, `readabilityFound`. [L3]

### `structure.link_navigation`

14. A **followable link** is an `<a>` whose `href` resolves to a real URL, relative or absolute. [L4]
15. An **unfollowable link** is any of: [L4]
    - an `<a>` with no `href`, an empty `href`, `href="#"`, or an `href` beginning `javascript:`;
    - a non-`<a>` element with `role="link"`;
    - any element with an inline `onclick` attribute whose value contains `location`, `href` or `window.open`.
16. Each element is counted at most once. An `<a>` with a real `href` is followable even if it also has an `onclick`. [L4]
17. Ignored entirely — neither followable nor unfollowable: in-page anchors (`href` beginning `#` followed by a fragment, e.g. `#pricing`), and `<button>` elements without a navigating inline `onclick`. [L4]
18. `unfollowablePercent = unfollowable ÷ (followable + unfollowable) × 100`, rounded with the shared `percentage()` helper. [L4]
19. Verdicts, in order: [L4]
    - `rawHtml` is `null` → `skip`, `reason: "raw fetch failed"`.
    - no followable links (including a page with no link-like elements at all) → `fail`.
    - `unfollowablePercent > fail` → `fail`.
    - `unfollowablePercent > warn` → `warn`.
    - otherwise → `pass`.
20. Evidence: `followableLinks`, `unfollowableLinks`, `unfollowablePercent`, and `examples` — up to 5 unfollowable elements, each as its tag name and its `outerHTML` trimmed to at most 120 characters. [L4]
21. Click handlers attached by script (`addEventListener`, framework `onClick` props) are invisible in HTML. The check does not claim to detect them, and the rulebook's report text for this criterion must not imply that it does. [L4]

### Rulebook

22. `scraper/criteria.yaml` gains one entry per new key, `dimension: structure`, `scope: page`, following the existing entry shape. [L3] [L4]
23. Thresholds: [L3] [L4]
    - `structure.extraction_ratio`: `fail: 0.25`, `warn: 0.5` (readable ÷ all raw text).
    - `structure.link_navigation`: `fail: 30`, `warn: 10` (percent of link-like elements that are unfollowable).
24. Starting weights and report text (tunable; see Open Questions): [L3] [L4]
    - `structure.extraction_ratio` — weight 6, severity high, effort M. Title "Most of the page's text is menus and page chrome". Why: an agent reads and pays for every word, and reader-style extraction may miss the content. Fix: put primary content in a clear main content region and trim repeated chrome.
    - `structure.link_navigation` — weight 7, severity high, effort S. Title "Links an agent cannot follow". Why: agents follow `href`s; links written as `#`, `javascript:` or inline click handlers lead nowhere. Fix: use `<a>` elements with real `href` URLs for navigation.
25. Each check reads its thresholds once at the top with `thresholdsFor(rulebook, CRITERION)`. No cutoff number appears in Section C code. [L3] [L4]

### Wiring and output

26. `scraper/src/section-c/index.ts` exports `runSectionCAudit(snapshot: PageSnapshot, rulebook: Rulebook): Finding[]`. **The function is synchronous**, for the same reason as `runSectionBAudit`: a function that cannot `await` cannot fetch.
27. `section-c/` contains only pure check functions and no network code.
28. The root `scraper/src/index.ts` imports only `runSectionCAudit`, passes it the snapshot it already captured and the loaded rulebook, and prints the result with `printFindings("Section C — structure", …)` after Section B.
29. Section C adds no capture work: no change to `page-snapshot.ts`, `interaction-probe.ts` or `PageSnapshot`.
30. `@mozilla/readability` is declared as a direct dependency of `scraper` (already present in `scraper/package.json` at `^0.6.0`, uncommitted, at Spec time).
31. `CLAUDE.md` is updated: Section C described alongside A and B, the `pnpm scraper` row mentions Section C, the "no test suite yet" line is replaced with how to run the tests.

### Tests

32. `scraper/package.json` gains a `test` script running Node's built-in test runner over `src/**/*.test.ts`. No test framework dependency is added. [L6]
33. Test files live beside the code as `scraper/src/section-c/*.test.ts`. [L6]
34. Each test builds a `PageSnapshot` literal with a small inline HTML string as `rawHtml`, loads the real rulebook with `loadRulebook()`, calls a check function, and asserts on `status` and relevant evidence. No network, no browser. [L6]
35. Required cases: [L6]
    - extraction ratio: content-heavy article page → `pass`; chrome-heavy page → `fail`; `rawHtml: null` → `skip` with `"raw fetch failed"`; raw HTML with no text → `fail` with `ratio: null`.
    - link navigation: `<a href="/pricing">` counted followable; `<a href="#">`, `<a href="javascript:void(0)">`, `<span role="link">` and `<div onclick="location.href='/x'">` counted unfollowable; `href="#pricing"` and a plain `<button>` ignored; a page with no followable links → `fail`; a share above 30% → `fail`; above 10% → `warn`; `rawHtml: null` → `skip`; `examples` capped at 5.
36. Test cases cover Section C only. The setup — the `test` script and a shared helper that builds a `PageSnapshot` from an HTML string — is not Section C-specific, so later sections' tests reuse it. [L6]

## Technical Decisions

- **Raw HTML, no guard, no fallback** [L2]. The tool measures what agents receive. The rejected alternative — rendered HTML — would pass a JavaScript-built page that most agents see as empty. A skip guard for near-empty raw pages was also rejected: a JavaScript shell failing both Section B and Section C is an accurate reflection of agent visibility, not double-counting to be hidden.
- **Readability on `linkedom`** [L3]. `linkedom` is already the scraper's parser. Readability is built and tested against `jsdom` and is reported to mostly work on `linkedom`. If the tests show it misbehaving, add `jsdom` as a dependency for this one check rather than changing the shared extractor.
- **Markup-only link detection** [L4]. Only inline signals are visible in raw HTML; script-attached handlers are not visible in the rendered DOM either. The check reports what it can see and says so, rather than inferring.
- **No table check** [L5]. The only reliable raw-HTML signal (ARIA roles on div tables) almost never appears there, and heuristic detection would falsely fail card grids and footers. A false fail damages trust in every other finding.
- **Tests start here** [L6]. Section C's checks are pure over a string, which makes it the cheapest place to start: fixtures force rare paths and stay stable while real sites change.

## Testing Strategy

The Test Seam is the existing one: check functions are synchronous and pure over a `PageSnapshot` and a `Rulebook`. Tests construct a `PageSnapshot` literal whose `rawHtml` is a small inline HTML string, load the real `criteria.yaml` through `loadRulebook()`, and assert on the returned `Finding`. No network, browser, or fake of either is needed. [L6]

Using the real rulebook rather than a test-only one means a threshold renamed in `criteria.yaml` but not in code fails the tests loudly, through `thresholdsFor`. Assertions should still be written so tuning a threshold value does not break them — fixtures sit clearly on one side of the cutoff.

Tests are run with `pnpm --filter scraper test` (`node --test`). They cover Section C only. [L6]

Manual verification: run `pnpm scraper <url>` against a content page (e.g. a news article), a JavaScript-heavy app, and a docs site, and confirm the Section C block prints with sensible verdicts. `pnpm lint` must pass.

## Out of Scope

- Heading hierarchy, semantic landmarks, descriptive anchor text, and the Markdown conversion noise ratio. [L1]
- Any table check — div grids, header cell association, colspan, images of tables. [L5]
- Judging rendered HTML in Section C. [L2]
- Detecting click handlers attached by script. [L4]
- Tests for Sections A and B. [L6]
- Scoring, gates and dimension scores — build step 3; Section C only emits findings.
- Crawling multiple pages — build step 4.

## Open Questions

- **Minimum link count** [L7]. Should `structure.link_navigation` require a minimum number of link-like elements before judging by percentage? Recommended: `min_links: 5` in `criteria.yaml`; below it, `pass` if at least one link is followable and `fail` if none is; evidence includes `minLinks`. Until decided, Requirement 19 applies at any count.
- **Starting weights and report text.** Requirement 24's values are first guesses to be tuned once real audits exist.

## Follow-Ups

- **`structure.extraction_ratio` on pages that are not articles.** Readability
  looks for one body of prose, so home pages, category pages and product grids
  score near zero however well built they are — measured after Work Item 04:
  `anthropic.com` 0.10 and `apple.com` 0.01, against 0.86 for
  `anthropic.com/news/claude-3-family`. The verdicts are literally correct (both
  home pages really are mostly menu by character count) but at weight 6 they
  penalise a page for being a directory. Options: page-type awareness in
  scoring; rely on the crawler sampling content pages; or gate the check on
  `isProbablyReaderable`, which returned `false` for both home pages and `true`
  for the article, and `skip` rather than `fail` when a page is not
  reader-shaped. The last would change Requirement 12. Deferred until the tool
  is complete.
- Tests for Sections A and B, reusing this Spec's test setup. Section B's checks are pure over a snapshot; Section A's also need fake probe results (agent responses, robots.txt data).
