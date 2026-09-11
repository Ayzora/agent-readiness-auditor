---
type: Work Item
title: "Page snapshot capture layer"
parent: ../spec.md
status: done
---

## What to build

The shared page capture layer: `scraper/src/page-snapshot.ts`, outside every section folder, performing all page-scope network I/O and returning one `PageSnapshot`.

Sections C, D, E and F need the identical raw-and-rendered pair for a page. Building this the Section A way — each section fetching its own bytes — would be five duplicate fetches of every URL. Section A's own probes stay where they are: robots, sitemap and rate limit are site-scope and unshareable.

**One browser session per page**, in this order: the raw request runs first, the browser then opens at the raw half's resolved address, the rendered DOM is captured, and only then may interaction begin (Work Item for interaction capture is separate). Nothing measured is contaminated by clicking.

The layer **records** redirect facts; it does not judge them. Deciding which are findings belongs to Section B.

## Required context

- Raw half: `gotScraping()` called directly — 15 second timeout, follow redirects, record the final resolved URL. No `HttpCrawler`, no `RequestQueue`. Crawlee's value is queue management across many URLs; this is two GETs of one URL, and the current code opens and drops a whole `RequestQueue` per fetch (`scraper/src/section-a/ua-probe.ts:41`, `:75`).
- Rendered half: Playwright Chromium directly — `page.goto(resolvedUrl, { waitUntil: 'load', timeout: 30_000 })`, then `await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})`, then `page.content()`.
- Both halves send the **same real desktop Chrome user agent**. Section A varies the UA and holds rendering constant; Section B does the reverse. Using an agent UA for the raw half would report "your content requires JavaScript" when the truth is "you block this agent".
- `scraper/src/section-a/sitemap.ts:55` already shows the degradation pattern to match.
- When the crawler arrives at build step 4 it feeds URLs *into* this layer; the layer does not itself need to be a Crawlee crawler.
- Do not write captures to disk. No `snapshots/` directory — persistence is build step 3, in Supabase.

## Acceptance criteria

- [x] `scraper/src/page-snapshot.ts` exists outside every section folder and is the only place page-scope network I/O happens.
- [x] `PageSnapshot` is added to `scraper/src/types.ts` with: `url` (input), `resolvedUrl`, `rawHtml`, `renderedHtml`, `visibleText`, `domText`, `statusCode`, `headers`, `redirectChain`, `browserFinalUrl`, `renderSettled`, `timing: { rawMs, renderedMs }`, `error`.
- [x] Exactly one browser session is opened per page, and it is opened only after the raw request has resolved.
- [x] The browser opens at the raw half's **resolved** URL, not the input URL, so a server-side redirect cannot leave the two halves describing different pages.
- [x] Both halves send an identical desktop Chrome user agent string.
- [x] `renderSettled` records `'networkidle' | 'load-timeout'` — which settle state was actually reached.
- [x] A `networkidle` timeout is swallowed and the capture proceeds regardless; it never prevents a capture.
- [x] Capture never throws. On failure, fields are null and `error: string` is populated, so one dead page cannot abort an audit.
- [x] `redirectChain` and `browserFinalUrl` record the redirect facts without the module deciding whether any of them is a problem.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 1, 5
- Requirements: 1-10
- Interview Ledger: L1, L3, L4, L11

## Blocked by

- `01-text-extraction-and-finding-types.md`
