---
type: Work Item
title: "Section A baseline correction"
parent: ../spec.md
---

## What to build

Fix Section A's baseline mismatch check, which is wrong today, by reusing the shared snapshot.

`humanCrawler()` (`scraper/src/section-a/ua-probe.ts:36`) renders the page in Playwright and returns the rendered DOM. `userAgentCrawler()` (`ua-probe.ts:70`) uses `HttpCrawler` and returns raw HTML. `findBaselineMismatchedAgents()` (`ua-probe.ts:147`) compares them with `!==`. That comparison is rendered-DOM against raw-HTML, so on any site with meaningful JavaScript **every agent is reported as mismatched** — because JS changed the DOM, not because the site treated the agent differently. The check cannot currently distinguish "you serve bots different content" from "you use React".

Two changes:

1. **Delete `humanCrawler()`.** The baseline becomes the snapshot's **raw** half — raw-with-a-browser-UA against raw-with-an-agent-UA. One variable, the same principle the capture layer applies in the other direction.
2. **Replace the `!==` comparison** with normalised text length via `extractText`, flagging a mismatch when lengths differ by more than 10%.

`runSectionAAudit(url, snapshot)` takes both: the URL for robots, sitemap and rate-limit work, and the snapshot for the baseline. Everything else in Section A is unchanged.

## Required context

- Exact string or hash comparison is brittle even once both sides are raw: any CSRF token, nonce, timestamp or session ID in the markup makes two identical pages compare as different. The product spec's "compare body hash" has this same weakness, since hashing bytes is still exact matching.
- Robots, sitemap and rate-limit probes are site-scope and cannot use a page snapshot — they keep taking the URL and stay exactly as they are.
- **Section A's remaining probes are deliberately not migrated off Crawlee.** Refactoring working network code with no test suite is a poor trade and is scope creep. Once Section B exists we will know whether the direct approach is genuinely better, and that refactor becomes an informed decision rather than a guess.
- `BaselineMisMatch` in `scraper/src/types.ts` currently carries `baselineHtml` / `agentUaHtml`; it should carry the measured lengths the new verdict rests on.
- Converting Section A's output to findings is **out of scope** — it converts at build step 2 when the rulebook lands.

## Acceptance criteria

- [ ] `humanCrawler()` is deleted, along with its now-unused Crawlee imports.
- [ ] `runSectionAAudit(url, snapshot)` accepts both the URL and the page snapshot.
- [ ] The UA-probe baseline is the snapshot's **raw** half, so both sides of the comparison are raw HTML.
- [ ] `findBaselineMismatchedAgents` compares normalised text length via the shared `extractText`, not `!==` on HTML and not a hash.
- [ ] A mismatch is flagged only when lengths differ by more than 10%.
- [ ] Robots, sitemap and rate-limit probes are unchanged and still take the URL.
- [ ] No Section A probe is migrated to `got-scraping`/Playwright as part of this Work Item.
- [ ] Section A still returns its existing output shape; it is not converted to findings here.
- [ ] `pnpm lint` passes.

## Covers

- User Stories: 6
- Requirements: 37-39
- Interview Ledger: L5, L6

## Blocked by

- `01-text-extraction-and-finding-types.md`
- `02-page-snapshot-capture-layer.md`
