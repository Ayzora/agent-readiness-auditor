---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: Which of the spec's six Section C (structure) items are worth building, given the tool measures visibility to AI agents rather than humans?

Recommended Answer:
- Judge each item by what an agent actually does: fetch HTML, reduce it to text or Markdown, hand it to a language model, and sometimes follow links.
- High value: extraction ratio (token cost of page chrome), links (real `href` vs click handlers), tables (div grids flatten into jumbled text).
- Low value or duplicate: heading hierarchy (h1 count, skipped levels, headings used for styling), semantic landmarks, descriptive anchor text, table header cells and colspan, Markdown conversion noise ratio.

Answer: Keep only the first three high-value items, and update `agent-readiness-auditor-spec.md` §3 C to match.

Decision: Section C covers the extraction ratio and link navigation (tables were later dropped — see L5). Every other item from the original §3 C list is cut, and the product spec records the cut and its reason.

Reason: The cut items are accessibility concerns a language model reads past, duplicate the extraction ratio, or cannot be detected reliably. Scoring a site down for skipped heading levels would make the tool look like an accessibility checker relabelled for AI — the same honesty the spec applies to `llms.txt`.

Answer History:
- Initial recommendation: build items 1–5, defer images-of-tables and headings-for-styling, drop the Markdown noise ratio.
- Revised after the user asked which items matter for agents: keep extraction ratio, links and tables; also considered keeping "page has no headings at all".
- Final answer: extraction ratio, links and tables only; tables subsequently dropped in L5.

Negative Requirements:
- Do not build heading hierarchy, landmark, anchor-text, table, or Markdown noise ratio checks.

### L2

Status: current

Question: Do Section C checks read the raw HTML or the rendered HTML?

Recommended Answer:
- Raw HTML (`snapshot.rawHtml`) for every Section C check.
- No guard for near-empty raw pages and no fallback to rendered HTML.
- `rawHtml === null` (the raw fetch itself failed) → `skip` with reason `"raw fetch failed"`.

Answer: Raw HTML. It is fine for a JavaScript shell to fail Section C as well, because most real AI agents would fail on that page too.

Decision: Section C judges only `snapshot.rawHtml`. A near-empty raw page fails Section C checks rather than skipping them.

Reason: The tool measures what agents actually receive, and most agents fetch HTML without executing JavaScript. Judging the rendered DOM would describe a page most agents never see — for example, a JavaScript-built pricing table would pass Section C while being absent for the agent.

Answer History:
- Initial recommendation: rendered HTML, to avoid a JavaScript-heavy site failing both Section B and Section C for one cause.
- Revised recommendation: raw HTML with a skip guard (`min_raw_text_chars`) so a JavaScript shell does not receive misattributed Section C remediation.
- Final answer: raw HTML, no guard — the user accepted the double failure as a true reflection of agent visibility.

Negative Requirements:
- Do not fall back to `renderedHtml` in any Section C check.
- Do not skip a Section C check because the raw page has little text.

### L3

Status: current

Question: How exactly is `structure.extraction_ratio` measured and judged?

Recommended Answer:
- Readable text: `@mozilla/readability` over the raw HTML parsed with `linkedom`; take the article's text and collapse whitespace the way `extractText` does.
- All text: `extractText(snapshot.rawHtml)`.
- Ratio: readable characters ÷ all characters, clamped to at most 1.
- Thresholds in `criteria.yaml`: `fail: 0.25`, `warn: 0.5`. Below fail → `fail`; below warn → `warn`; otherwise `pass`.
- Readability returns no article → `fail`, `readabilityFound: false`.
- Raw HTML has no text → `fail`, `ratio: null`, `rawChars: 0`.
- `rawHtml === null` → `skip`, `"raw fetch failed"`.
- Evidence: `ratio`, `readableChars`, `rawChars`, `readabilityFound`.
- Risk: Readability is built for `jsdom`; if it misbehaves on `linkedom`, add `jsdom` for this one check.

Answer: Accepted as recommended.

Decision: Extraction ratio is Readability's main-content text length over all raw-HTML text length, judged against `fail`/`warn` thresholds in the rulebook, with the edge cases above.

Examples:
- An article page with a slim header and footer → ratio around 0.8 → `pass`.
- A page that is mostly navigation, footer links and cookie text → ratio 0.15 → `fail`.

### L4

Status: current

Question: What counts as a link an agent cannot follow, and when does `structure.link_navigation` fail?

Recommended Answer:
- Followable: `<a>` whose `href` resolves to a real URL, relative or absolute.
- Unfollowable: `<a>` with no `href`, empty `href`, `href="#"`, or `href="javascript:..."`; a non-`<a>` element with `role="link"`; any element with an inline `onclick` that navigates (contains `location`, `href` or `window.open`).
- Ignored: in-page anchors such as `href="#pricing"`; `<button>`s without a navigating `onclick`.
- Thresholds in `criteria.yaml`: unfollowable share above `fail: 30` percent → `fail`; above `warn: 10` percent → `warn`; otherwise `pass`.
- No followable links at all → `fail`.
- `rawHtml === null` → `skip`, `"raw fetch failed"`.
- Evidence: `followableLinks`, `unfollowableLinks`, `unfollowablePercent`, and up to 5 unfollowable examples (tag plus a trimmed snippet).
- The Spec states that handlers attached by script (`addEventListener`, framework `onClick` props) are invisible in HTML and not detected.

Answer: Accepted as recommended.

Decision: Link navigation classifies link-like elements in raw HTML as followable or unfollowable by markup alone and judges the unfollowable share against rulebook thresholds; a page with no followable link fails.

Negative Requirements:
- Do not claim to detect click handlers attached by script.
- Do not count in-page `#anchor` links or non-navigating buttons either way.

### L5

Status: current

Question: How does a table check spot a table built from divs, and is it worth building?

Recommended Answer:
- Only reliable signal in raw HTML: ARIA `role="table"`/`role="grid"` on non-`<table>` elements. Row-repetition and class-name heuristics would falsely fail product-card grids and footers.
- Most hand-built div grids (pricing comparison, spec sheets) carry no ARIA role; the grid libraries that do add `role="grid"` (AG Grid, MUI DataGrid) render with JavaScript and are usually absent from raw HTML.
- So an ARIA-only check on raw HTML would almost never fire. Drop the table check and record why.

Answer: Drop it.

Decision: Section C has no table check. The product spec lists tables among the deliberately cut items with this reason.

Reason: A heuristic that fires falsely tells a site owner to fix something that is not broken and damages trust in every other finding; a reliable-but-narrow check would rarely find anything. The underlying harm — a grid flattening into jumbled text — is partly covered by the extraction ratio and Section B's text coverage.

Answer History:
- Initial recommendation: keep a table check limited to ARIA-labelled div tables.
- Final answer: drop the table check entirely after establishing that labelled div grids rarely appear in raw HTML.

Negative Requirements:
- Do not build a table check based on row-repetition or class-name heuristics.

### L6

Status: current

Question: How is Section C verified — manual `pnpm scraper <url>` runs as with Sections A and B, or automated tests?

Recommended Answer:
- Tests built from small fake HTML pages written as strings in the test file, handed to the check functions, asserting on the returned status and evidence.
- Run with Node's built-in `node --test`; no new dependency.
- A `test` script in `scraper/package.json`; test files beside the code as `scraper/src/section-c/*.test.ts`.
- Tests cover Section C only.
- Plus one manual `pnpm scraper <url>` run to confirm the wiring prints Section C.

Answer: Create the fake-HTML tests, as their own Work Item.

Decision: Section C ships with its first automated tests — fake-HTML fixtures run by `node --test` — delivered as a separate Work Item. Manual CLI runs confirm the wiring.

Reason: Fake HTML can force rare paths (inline navigating `onclick`, zero followable links, `rawHtml: null`) that real sites rarely present, and fixed fixtures keep producing the same verdict when real sites change.

Answer History:
- The user first asked why console-logging real runs, as done for Sections A and B, was not enough; a manual-only option was offered as an alternative.
- Final answer: add the fake-HTML tests as a Work Item.

### L7

Status: deferred

Question: Should `structure.link_navigation` require a minimum number of link-like elements before judging by percentage?

Recommended Answer:
- Add `min_links: 5` to the check's thresholds in `criteria.yaml`.
- Fewer than 5 link-like elements in total: `pass` if at least one is followable; `fail` if none is (the L4 rule, regardless of count).
- 5 or more: the L4 percentage rules apply.
- Evidence includes `minLinks`.

Answer: Not answered — the interview moved to Spec creation.

Reason: On a three-link contact page, one `<a href="#">` is 33% and would fail with the same severity as a site whose whole navigation is broken.
