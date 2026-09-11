---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: Does the page dual fetch live inside `section-b/`, or as a shared module that Section B is merely the first consumer of?

Recommended Answer:
- Shared module `scraper/src/page-snapshot.ts`, outside every section folder.
- `PageSnapshot` carries raw HTML, rendered HTML, status, headers and timing.
- `runSectionBAudit` takes the snapshot rather than a URL, and is synchronous.

Answer: Shared module. The user's original design gave each section its own fetch, and they revised on seeing that Sections C–F need identical input.

Decision: Page-scope Phase 1 capture lives outside the section folders. Section-scope probes stay inside their section.

Reason: Putting the capture in `section-b/` would force Section D to import from `section-b/`, exactly the cross-section reach CLAUDE.md forbids. A synchronous `runSectionBAudit` signature also makes the no-I/O-in-Phase-2 rule enforceable by the type system rather than by convention.

Answer History:
- Initial design: each section performs its own fetch, following Section A's `runSectionXAudit(url)` shape.
- Final answer: shared capture module; `runSectionXAudit(url)` is retained for site-scope Section A only.

### L2

Status: current

Question: How exactly is `text_coverage_ratio` computed?

Recommended Answer:
- One `extractText(html)` applied to both sides, so the ratio does not partly measure the parser.
- Parser: `linkedom`, declared as a direct dependency.
- Strip `<script>`, `<style>`, `<noscript>`, `<template>`, `<svg>`, HTML comments.
- Collapse whitespace, count characters not words.
- `textContent`-style, never `innerText`.
- Clamp reported value to `[0, 1]`, keep the unclamped value in evidence.
- Zero denominator yields `null` and its own finding, never `0` or `NaN`.

Answer: Accepted as recommended.

Decision: `text_coverage_ratio` = raw text length ÷ rendered text length, both produced by one shared character-counting extractor.

Reason: `<script>` stripping matters most — SSR hydration payloads run to tens of kilobytes and would inflate the raw side on exactly the JavaScript-heavy sites the check exists to catch. `innerText` is CSS-aware and would bias the ratio downward on any site with collapsed accordions, since raw HTML has no CSS applied.

Negative Requirements:
- Do not use `innerText` for either side of the ratio.
- Do not report `0` or `NaN` when the rendered page has no text.

### L3

Status: current

Question: What exactly is captured, and when?

Recommended Answer:
- Both halves send the same real desktop Chrome user agent.
- Raw half: `gotScraping()` directly, 15s timeout, follow redirects, record the resolved URL.
- Rendered half: Playwright directly — `waitUntil: 'load'`, then up to 5s for `networkidle`, swallow the timeout, capture regardless.
- Record which settle state was reached.
- Render the raw half's resolved URL, not the input URL.
- Failures return with nullable fields plus an `error`; never throw.
- Use `got-scraping` and Playwright directly rather than Crawlee.

Answer: Accepted, including the choice to drop Crawlee for these two fetches.

Decision: The capture contract is fixed as recommended.

Reason: Using an agent UA for the raw half and Chrome for the rendered half would produce a near-zero ratio on any site that challenges that agent, reporting "your content requires JavaScript" when the truth is "you block this agent" — a misdiagnosis Section A already handles correctly. Section A varies the UA and holds rendering constant; Section B does the reverse. Insisting on `networkidle` as a hard gate would yield no capture at all on sites with polling widgets or live chat.

Negative Requirements:
- Do not vary the user agent between the two halves.
- Do not let a `networkidle` timeout prevent a capture.
- Do not throw on fetch failure.

### L4

Status: current

Question: How should redirects be handled, and is a redirect inherently bad?

Answer: The user observed that redirect handling is a cross-cutting concern rather than a Section B concern, and asked whether redirects should simply be flagged.

Decision: Redirect policy lives in the shared capture layer, which records the facts. Section B decides which facts are findings. Only three shapes are flagged: a JavaScript-only redirect, raw and browser halves finishing at different addresses, and a redirect to the homepage in place of the requested page. Chains of 3+ hops are recorded as low severity.

Reason: Most redirects are healthy and universal — `http`→`https`, trailing slashes, locale prefixes. Flagging all of them would bury the real findings, and the spec's report structure has an explicit "Ignore list" for precisely this category. Recording the facts once in the capture layer gives Sections D, E and F the same information for free.

Negative Requirements:
- Do not report a plain single-hop redirect as a finding.

### L5

Status: current

Question: Should Section A be changed to consume the shared snapshot, rather than being left alone?

Answer: Yes — the user directed that Section A be simplified to use the shared snapshot where applicable, overriding an initial recommendation to leave it untouched.

Decision: `humanCrawler()` is deleted. `runSectionAAudit(url, snapshot)` takes the URL for robots, sitemap and rate-limit work, and the snapshot's raw half as the UA-probe baseline. Section A's other probes are unchanged.

Reason: This is the only shareable piece — robots, sitemap and rate-limit probes are site-scope and cannot use a page snapshot. It also fixes a live bug: `humanCrawler` returns a rendered DOM while `userAgentCrawler` returns raw HTML, so `findBaselineMismatchedAgents` compares rendered against raw and reports every agent as mismatched on any JavaScript site.

Answer History:
- Initial recommendation: leave Section A alone; refactoring working network code without tests is a poor trade.
- Final answer: user directed the change; it was then found to fix a correctness bug, not merely tidy code.

### L6

Status: current

Question: Should the baseline mismatch comparison also be changed from exact string comparison, or left as known debt?

Recommended Answer: Compare normalised text length via `extractText`, flagging a mismatch when lengths differ by more than 10%.

Answer: In scope.

Decision: `findBaselineMismatchedAgents` compares normalised text length with a 10% margin.

Reason: `!==` on HTML is brittle even once both sides are raw — any CSRF token, nonce, timestamp or session ID makes two identical pages compare as different. The spec's "compare body hash" carries the same weakness, since hashing bytes is still exact matching.

### L7

Status: current

Question: What is the interaction probe allowed to click, and how much?

Recommended Answer:
- Measure hidden-but-present content with zero clicks, by comparing CSS-visible text against full DOM text.
- Click only for genuinely absent content: one "Load more" control, the consent banner, and up to 3 scrolls.
- Budget: 3 clicks, 10 seconds per page.
- Exhaustive allowlist; never touch forms, cross-URL links, or transactional controls.

Answer: Revised design accepted (~3 clicks).

Decision: Hidden content is split in two. Hidden-but-present is measured free and can never fail. Only genuinely-absent content justifies clicking, under a strict allowlist and a hard budget.

Reason: The user observed that the tool exists to see what agents see, and agents do not click. That is right for the measurement, though clicking is still needed to size the gap. Most accordion and tab content is already in the DOM and readable by a text-parsing agent, so it needs no clicking and is barely a problem. An allowlist beats a blocklist because a blocklist clicks unfamiliar controls by default, and under-counting hidden content is a slightly wrong number while clicking "Add to cart" on a stranger's shop is a real incident.

Answer History:
- Initial recommendation: 15 clicks / 10 seconds, clicking `<details>`, `aria-expanded="false"`, `role="tab"` and load-more controls.
- User challenge: agents do not click, so why should the probe?
- Final answer: ~3 clicks; ARIA and `<details>` content measured without clicking at all.

Negative Requirements:
- Never click anything inside a `<form>`.
- Never click a link pointing to a different URL.
- Never click controls matching buy / checkout / submit / pay / delete / sign up / add to cart / subscribe.
- `render.hidden_but_present` must never return `fail`.

### L8

Status: current

Question: What does Section B hand back — a raw result bag matching Section A, or finding records?

Recommended Answer: Emit findings shaped `{ criterionKey, url, status, evidence }`, with `status` one of pass / fail / warn / skip.

Answer: Accepted, provided the output carries measurable data usable for remediation advice.

Decision: Section B returns `Finding[]`. `evidence` carries the measured values the verdict rests on. `skip` is excluded from scoring entirely.

Reason: The finding shape is already complete without `criteria.yaml`, because check functions return status and evidence only — weight, severity, title and fix text come from the rulebook. Everything downstream is built on this shape: the database table is it, the re-run diff joins on it, the report groups by `criterionKey`. Scoring `skip` as a pass inflates the score; scoring it as a fail defames the site.

Examples:
- `{ criterionKey: "render.text_coverage", url: "…/pricing", status: "fail", evidence: { rawChars: 812, renderedChars: 9440, ratio: 0.086 } }`

### L9

Status: current

Question: What is the bar — where do the pass/warn/fail thresholds come from?

Answer: The thresholds are asserted, not derived. The user accepted them along with that caveat stated openly.

Decision: Thresholds live as named constants pending `criteria.yaml`, with the governing principle: could an agent reading only HTML still answer a basic question about this page? `text_coverage` passes at ≥ 0.6, warns at 0.3–0.6, fails below 0.3. `alt=""` counts as a pass.

Reason: No published threshold exists for these measures and there is no cohort to compare against — site #1 has no peer group. The spec's gates (caps at 20, 25, 40) are structural and separate from these per-check thresholds. Phase 2's task harness makes the bar empirical by measuring which ratios actually correlate with agent task failure; until then the report must state its bar and reasoning openly, which is what the rulebook's `why` field is for.

Negative Requirements:
- Do not treat `alt=""` as a missing alt attribute; empty alt is correct markup for a decorative image.

### L10

Status: current

Question: Should soft 404s be detected with an extra request to a URL that cannot exist, or by guessing from page content?

Recommended Answer: Use the probe — one request to `/zzz-does-not-exist-<random>`. A 200 response proves the site soft-404s and yields an error-page fingerprint to compare real pages against.

Answer: Accepted.

Decision: Soft 404 detection uses a site-level Phase 1 probe costing one extra request.

Reason: Detecting soft 404s from page content alone is pattern-matching titles for "not found" and hoping. One request on a ~100-request budget buys reliability.

### L11

Status: current

Question: One browser session per page, or two?

Recommended Answer:
- One session: raw GET, open the browser once, capture the DOM, then interact on the same open page, then close.
- The interaction probe therefore moves out of `section-b/` to sit beside `page-snapshot.ts`.
- `section-b/` ends up containing only pure check functions.

Answer: Accepted.

Decision: One browser session per page. Interaction capture is a shared page-scope Phase 1 module, not a section-local one.

Reason: Two sessions would make three requests per page against the spec's budget of two — 50% more load on the audited site at 40 pages. This reverses part of L1, where the interaction probe was placed inside `section-b/` by analogy with `rate-limit-probe.ts`; that analogy was wrong, because the rate-limit probe is site-scope and Section-A-only, whereas interaction capture is page-scope and Section E will need it for forms and CAPTCHA-on-interaction.

Answer History:
- Initial recommendation (L1): interaction probe lives inside `section-b/`.
- Final answer: it lives beside the snapshot in the shared layer, and `section-b/` holds no network code at all.

### L12

Status: current

Question: Should snapshots be saved to disk, and should a test suite with committed fixtures be started?

Recommended Answer: Two CLI flags (`--save`, `--snapshot`), four committed fixtures, and `node --test`, so invented thresholds can be tuned against a frozen input.

Answer: Out of scope. No saving for now.

Decision: No snapshot persistence, no fixtures, no automated tests in this work. Verification is manual via `pnpm scraper <url>`, plus `pnpm lint`.

Reason: The user's position is that persistence belongs in Supabase at build step 3, and that the current goal is completing sections. A file-based store built now would be deleted when the database lands. The Test Seam is still created by this work — `runSectionBAudit(snapshot, interactions)` is synchronous and pure over plain data — so a future suite constructs a `PageSnapshot` literal with no network and no browser.

Answer History:
- Initial recommendation: write snapshots to `scraper/snapshots/`, commit four fixtures, add `node --test`.
- User challenge: persistence is planned for Supabase, so why build a file store now?
- Revised recommendation: drop the store, keep two CLI flags plus fixtures, since fixtures are not persistence and never migrate.
- Final answer: all of it out of scope.

Negative Requirements:
- Do not add a `snapshots/` directory or write captures to disk.
- Do not add a test runner or test dependencies.
- Do not change `runSectionBAudit` to `async`; that would destroy the Test Seam.
