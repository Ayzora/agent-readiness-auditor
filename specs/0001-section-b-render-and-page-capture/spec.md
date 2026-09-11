---
type: Spec
title: "Section B (render) and the shared page capture layer"
---

## Problem

The scraper implements Section A (access) and nothing else. Section B — the render dimension — answers the question the spec calls the most quotable per-page number: does a page's content exist without JavaScript, or does an agent that downloads HTML see an empty shell?

Three things block it, and only one is Section B itself:

1. **There is no page capture layer.** Every Section A probe fetches its own bytes, which is correct for site-scope resources (one robots.txt per site) but wrong for page-scope work. Sections B, C, D, E and F all need the identical raw-and-rendered pair for a page. Built the Section A way, that is five duplicate fetches of every URL.

2. **Section A's baseline mismatch check is wrong today.** `humanCrawler()` (`scraper/src/section-a/ua-probe.ts:36`) renders the page in Playwright and returns the rendered DOM. `userAgentCrawler()` (`ua-probe.ts:70`) uses `HttpCrawler` and returns raw HTML. `findBaselineMismatchedAgents()` (`ua-probe.ts:147`) compares them with `!==`. That comparison is rendered-DOM against raw-HTML, so on any site with meaningful JavaScript **every agent is reported as mismatched** — because JS changed the DOM, not because the site treated the agent differently. The check cannot currently distinguish "you serve bots different content" from "you use React."

3. **Nothing in the codebase emits findings.** Section A returns a bag of ten named fields. The database table, the re-run diff and the report generator all join on a per-check finding record, so every one of those needs a translation layer written later against a shape invented for no reason.

## Proposed Outcome

A shared page capture layer outside the section folders, a Section B containing only pure check functions over that capture, and a corrected Section A baseline that reuses the same capture.

Running `pnpm scraper <url>` prints Section A's existing output plus a list of Section B findings, each carrying the measured values it was judged on.

## User Stories

1. As a site owner, I want to know what proportion of my page's text an AI agent sees when it downloads my HTML without running JavaScript, so I can judge whether agents can answer questions about my content.
2. As a site owner, I want to know which of my content is genuinely unreachable without interaction, separately from content that is merely visually hidden but present in the HTML, because only the first actually harms a text-parsing agent.
3. As a site owner, I want to be told when my page returns a 200 status while showing an error, because that page is silently invisible to every agent that trusts status codes.
4. As a site owner, I want each finding to carry the numbers behind it, so I can argue with the verdict rather than simply accept it.
5. As a developer of this tool, I want Section C, D, E and F to consume one page capture rather than each building their own, so adding a dimension costs a folder of pure functions and no new network code.
6. As a developer of this tool, I want Section A's baseline mismatch check to stop reporting false positives on every JavaScript site.

## Requirements

### Page capture (shared, Phase 1)

1. A shared module `scraper/src/page-snapshot.ts` performs all page-scope network I/O and lives outside every section folder, because Sections C–F need identical input. Section A's probes stay where they are: they are site-scope and unshareable. [L1]
2. Capture opens **one** browser session per page. The raw request runs first, the browser then opens at the resolved address, the rendered DOM is captured, and only then does interaction begin — so nothing measured is contaminated by clicking. [L11]
3. The raw half uses `gotScraping()` called directly, with a 15 second timeout, following redirects, recording the final resolved URL. No `HttpCrawler`, no `RequestQueue`. [L3]
4. The rendered half uses Playwright Chromium directly: `page.goto(resolvedUrl, { waitUntil: 'load', timeout: 30_000 })`, then `await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})`, then `page.content()`. The settle timeout is swallowed and the capture proceeds regardless. [L3]
5. The snapshot records which settle state was actually reached as `renderSettled: 'networkidle' | 'load-timeout'`. When a ratio looks wrong, this is the first field worth reading. [L3]
6. **Both halves send the same real desktop Chrome user agent.** The ratio must isolate JavaScript dependence alone; varying the UA as well would conflate "you block this agent" with "you require JavaScript", and Section A already measures the former. [L3]
7. The browser opens at the **raw half's resolved URL**, not the input URL, so a server-side redirect cannot leave the two halves describing different pages. [L3]
8. Capture never throws. Fields are nullable and an `error: string | null` accompanies them, matching how `section-a/sitemap.ts:55` already degrades. One dead page must not abort an audit — and at 40 pages, must not.
9. `PageSnapshot` is added to `scraper/src/types.ts`: `url` (input), `resolvedUrl`, `rawHtml`, `renderedHtml`, `visibleText`, `domText`, `statusCode`, `headers`, `redirectChain`, `browserFinalUrl`, `renderSettled`, `timing: { rawMs, renderedMs }`, `error`.

### Redirect handling

10. The snapshot **records** redirect facts; Section B decides which are findings. Most redirects are healthy — `http`→`https`, trailing slashes, locale prefixes — and flagging them all would bury real findings under noise. [L4]
11. Three shapes are flagged, and only these three: a JavaScript-only redirect (the raw response is a page but JS moves you to the real one, so an agent never arrives); the raw and browser halves finishing at different addresses (the ratio would compare unrelated pages, so flag instead of reporting a meaningless number); and a redirect to the homepage in place of the requested page, which is a soft 404 in disguise. A chain of 3 or more hops is recorded as a low-severity finding. [L4]

### Interaction capture (shared, Phase 1)

12. `scraper/src/interaction-probe.ts` sits beside `page-snapshot.ts`, **not** inside `section-b/`. It is page-scope Phase 1 work exactly as the snapshot is, and Section E will need it for forms and CAPTCHA-on-interaction. [L11]
13. Content that is hidden but present in the DOM is measured with **zero clicks**, by comparing the browser's CSS-visible text against the full DOM text. An agent parsing HTML reads that content perfectly well. [L7]
14. Clicking is reserved for content genuinely absent until interaction: one "Load more"-style control, the cookie consent banner, and scrolling to the bottom up to 3 times. [L7]
15. The click allowlist is exhaustive — a control is clicked only if it matches. An allowlist matters more than a blocklist here: under a blocklist an unfamiliar button is clicked *by default*, and on a live e-commerce site the default must be "do not touch it." [L7]
16. **Negative requirement — never clicked under any circumstance:** anything inside a `<form>`; any link pointing to a different URL; anything whose visible text matches *buy / checkout / submit / pay / delete / sign up / add to cart / subscribe*. [L7]
17. Budget: at most 3 clicks and 10 seconds per page, then stop regardless of state. [L7]
18. Consent handling captures body text, locates the banner, accepts, and captures again. The difference is content gated behind consent.
19. If interaction capture fails or hangs, the snapshot is still returned. `interactions` comes back `null` and every check depending on it returns `skip`. [L11]

### Text extraction

20. One function `extractText(html: string): string` is applied to **both** sides of every comparison. Extracting the two sides differently would make the ratio partly a measurement of the parser. [L2]
21. Extraction uses `linkedom`, declared as a direct dependency of `scraper`. All four candidate parsers are already in the pnpm store via Crawlee, but pnpm isolates by default so it must be declared. [L2]
22. Stripped before extraction: `<script>`, `<style>`, `<noscript>`, `<template>`, `<svg>`, and HTML comments. `<script>` matters most — SSR hydration payloads such as `__NEXT_DATA__` can run to tens of kilobytes and would inflate the raw side on exactly the JavaScript-heavy sites the check exists to catch. [L2]
23. Whitespace runs collapse to a single space; the result is trimmed. Length is counted in **characters**, not words — language-agnostic, no tokenizer, no CJK edge case. [L2]
24. Extraction is `textContent`-style, never `innerText`. `innerText` is CSS-aware and drops hidden elements, but raw HTML has no CSS applied; mixing the two biases the ratio downward on any site with collapsed accordions. Hidden content is caught separately by requirement 13. [L2]

### Section B checks (Phase 2, pure)

25. `scraper/src/section-b/index.ts` exports `runSectionBAudit(snapshot: PageSnapshot, interactions: InteractionCapture | null): Finding[]`. **The function is synchronous.** A function that cannot `await` cannot fetch — the signature enforces the no-I/O-in-Phase-2 rule rather than a comment requesting it. [L1]
26. `section-b/` contains **only** pure check functions and no network code whatsoever. The pattern CLAUDE.md records — Phase 1 probes and Phase 2 checks together inside a section folder — applies to Section A but deliberately not to Section B. [L11]
27. `text_coverage_ratio` = raw text length ÷ rendered text length, both via `extractText`. The reported value is clamped to `[0, 1]`; the unclamped value is preserved in evidence, since a ratio above 1 (JS removing SSR content) is itself signal worth keeping. [L2]
28. A zero denominator yields `null`, never `0` or `NaN`, and emits its own separate finding. An empty rendered page means the render failed or the page is genuinely blank — a different problem with different remediation, and scoring it as 0 would misattribute it. [L2]
29. Findings are emitted as records of the shape `{ criterionKey, url, status, evidence }`. Weight, severity, title and fix text are **deliberately absent** — the spec assigns those to the rulebook, so nothing here is blocked on `criteria.yaml` not yet existing. [L8]
30. `status` is one of `pass` / `fail` / `warn` / `skip`. `skip` means the check **could not run** and is excluded from scoring entirely — not counted as a pass, which inflates, and not as a fail, which defames. [L8]
31. `evidence` carries the measured values the verdict rests on, so a report can state "812 characters without JavaScript, 9,440 with" rather than only "fail". [L8]

### Thresholds

32. Thresholds live as named constants in one place per check, ready to lift into `criteria.yaml` at build step 2. [L9]
33. The thresholds are **asserted, not derived**, and are expected to be wrong at first. The principle underneath every one of them: *could an agent reading only HTML still answer a basic question about this page?* [L9]

| Check | pass | warn | fail | skip |
| --- | --- | --- | --- | --- |
| `render.text_coverage` | ratio ≥ 0.6 | 0.3–0.6 | < 0.3 | render failed, or rendered text is 0 |
| `render.hidden_but_present` | < 10% hidden | ≥ 10% | *never* | no rendered DOM |
| `render.content_behind_interaction` | no growth on click | — | text grew > 10% | no such control found |
| `render.infinite_scroll` | no infinite scroll | adds content, pagination exists | adds content, no pagination | — |
| `render.consent_wall` | no banner | banner present, gates nothing | > 30% of body gated | — |
| `render.soft_404` | — | — | 200 status, error-shaped content | status ≠ 200 |
| `render.canvas_content` | no canvas | canvas + adequate text | canvas + very little text | — |
| `render.images_missing_alt` | < 10% | 10–40% | > 40% | no images |
| `render.iframe_primary_content` | none | same-origin iframe, substantial text | iframe holds more text than the page | — |

34. `render.hidden_but_present` can **never** return `fail`. An agent parsing HTML reads that content fine, and failing a site for it would be dishonest — the same reasoning the spec applies to `llms.txt`. It becomes more serious in Phase 2, when the agent drives a browser. [L7]
35. `alt=""` counts as a **pass**, not a miss. Empty alt is the correct markup for a decorative image; only images with no `alt` attribute at all count against the site. Most tools get this wrong and generate noise. [L9]

### Soft 404 detection

36. Soft 404s are detected with a site-level Phase 1 probe: one request to a URL that cannot exist (`/zzz-does-not-exist-<random>`). If it returns 200 the site soft-404s, and its error page fingerprint is then available to compare real pages against. Content-pattern guessing alone is unreliable. [L10]

### Section A correction

37. `humanCrawler()` is deleted. The baseline becomes the snapshot's **raw** half — raw-with-a-browser-UA against raw-with-an-agent-UA, one variable, the same principle as requirement 6. [L5]
38. `runSectionAAudit(url, snapshot)` takes both: the URL for robots, sitemap and rate limit; the snapshot for the baseline. Everything else in Section A is unchanged.
39. `findBaselineMismatchedAgents` compares **normalised text length** via `extractText`, flagging a mismatch when lengths differ by more than 10%. Exact string or hash comparison is brittle even once both sides are raw: any CSRF token, nonce, timestamp or session ID in the markup makes two identical pages compare as different. The spec's "compare body hash" has this same weakness. [L6]
40. `scraper/src/index.ts` captures once and hands the result to both sections.

## Technical Decisions

- **Shared capture outside the sections** [L1]. Placing it in `section-b/` would force Section D to import from `section-b/`, precisely the cross-section reach CLAUDE.md forbids. Section A's `runSectionXAudit(url)` shape is right for site-scope work and wrong for page-scope work.
- **Direct `got-scraping` and Playwright, not Crawlee** [L3]. Crawlee's value is queue management and concurrency across many URLs; this is two GETs of one URL, and the current code opens and drops a whole `RequestQueue` per fetch (`ua-probe.ts:41`, `:75`). When the crawler arrives at build step 4 it feeds URLs *into* the capture layer; the capture layer does not itself need to be a Crawlee crawler.
- **Section A's remaining probes are not migrated to this style.** Refactoring working network code with no test suite is a poor trade and is scope creep on top of building Section B. Once B exists we will know whether the direct approach is genuinely better, and that refactor becomes an informed decision rather than a guess.
- **Findings now rather than a raw bag** [L8]. The finding shape is already complete without `criteria.yaml`, because check functions return status and evidence only. The database table is this shape, the re-run diff joins on it, and the report groups by `criterionKey`.
- **Two kinds of agent** [L7]. Layer 1's agent downloads HTML, so hidden-but-present content does not hurt it. Phase 2's agent drives a browser and *would* be blocked by a collapsed accordion. Hence: report it, weight it low, never fail on it.

## Testing Strategy

Automated tests are out of scope for this work by explicit decision [L12]. Verification is manual: run `pnpm scraper <url>` against a JavaScript-heavy site and a server-rendered site, and confirm the ratios differ in the expected direction.

The Test Seam is nonetheless **created** by this work and should not be compromised, because it is what makes later testing cheap: `runSectionBAudit(snapshot, interactions)` is synchronous and pure over plain data. Any future test suite constructs a `PageSnapshot` literal and asserts on returned findings, with no network and no browser. Keeping that signature synchronous is what preserves the seam — an `async` signature would silently permit I/O back into Phase 2 and destroy it.

`pnpm lint` (`tsc --noEmit` in `scraper`) must pass.

## Out of Scope

- **Snapshot persistence.** Saving captures for later re-scoring is build step 3 and belongs in Supabase alongside `site`, `audit` and `finding`. A file-based version now would be deleted the moment the database lands. [L12]
- **A test suite, committed fixtures, and `--save` / `--snapshot` CLI flags.** [L12]
- **`criteria.yaml`.** Build step 2. Thresholds stay as constants until then.
- **Converting Section A's output to findings.** It converts at build step 2 when the rulebook lands and it must anyway.
- **Migrating Section A's remaining probes off Crawlee.**
- **Crawling, template clustering, sampling.** Build step 4; capture runs against one URL.
- **Scoring, gates, dimension scores.** Build step 3. Section B emits findings; nothing consumes them yet.
- **Latency capture per UA probe and sitemap coverage-gap-vs-crawl** — already-deferred Section A items, unchanged here.

## Open Questions

- The exact `evidence` field shape per check. Each has an obvious default from its threshold row.
- How findings print to the terminal — grouped by status, or flat.
- Whether the CLI should accept flags beyond the URL.

## Notes

**CLAUDE.md needs amending as part of this work.** It currently records `runSectionAAudit(url)` as the pattern every section follows, and states that Section B should hold "Phase 1 fetch probes and Phase 2 check functions as separate files inside it." Both are deliberately not true of Section B. Left unamended, this reads as drift rather than a decision.

**Known debt, recorded rather than fixed:** `humanCrawler`'s deletion removes the duplicate render, but Section A and Section B still both run against the same single URL today. When the crawler lands, capture happens once per page and is shared — no change needed then.

**Glossary:** `GLOSSARY.md` was created during the interview. The distinction that matters most while implementing: **Section** is the code folder (`section-b/`), **Dimension** is the concept the rulebook keys off (`render`). Criterion keys use the dimension: `render.text_coverage`, never `section-b.*`.
