---
type: Work Item
title: "Section G: llms.txt probe, check, aggregator and tests"
parent: ../spec.md
status: done
---

## What to build

The whole of Section G's code: one Phase 1 probe, one Phase 2 check, the section aggregator, and the tests.

**Probe** — `scraper/src/section-g/llms-txt-probe.ts` exporting `captureLlmsTxt(url): Promise<LlmsTxtCapture>`:

- Fetches `/llms.txt` resolved against the audited URL's origin, and no other path.
- Never throws. Any failure degrades to a capture with null fields and a populated `error`.
- 10s timeout; the body is read whole.
- Performs no parsing.
- `LlmsTxtCapture` in `types.ts`: `url`, `statusCode`, `contentType`, `body`, `bytes`, `error`.

**Check** — `scraper/src/section-g/llms-txt.ts` exporting the synchronous pure `llmsTxtPresent(url, capture, rulebook): Finding`:

- Found requires all three: status 200; body is not HTML (`Content-Type` lacks `text/html` **and** the body, after stripping an optional BOM and leading whitespace, does not begin `<!doctype` or `<html`, case-insensitively); and the H1 test passes.
- H1: the first non-empty line, after stripping an optional BOM, matches `/^#\s+\S/`.
- File-list links: items matching `/^\s*-\s*\[[^\]]+\]\([^)]+\)/` appearing after the first `^##\s` heading.
- Blockquote summary: any `/^>\s+\S/` line — evidence only, never changes the verdict.
- `pass` when found and the link count is at least `min_links`; `warn` in every other case; `skip` only when the capture carries an `error`, with `reason: "llms.txt fetch failed"`. Never `fail`.
- `min_links` read with `thresholdsFor`, never hard-coded.
- Evidence: `found`, `statusCode`, `contentType`, `looksLikeHtml`, `hasH1`, `hasBlockquoteSummary`, `linkCount`, `bytes`, and `error` when captured.
- The finding's `url` is the site root.

**Aggregator** — `scraper/src/section-g/index.ts` exporting `runSectionGAudit(url, rulebook): Promise<Finding[]>`.

**Tests** — `llmsTxtFrom(overrides)` added to `scraper/src/utils.ts`, and `scraper/src/section-g/llms-txt.test.ts` covering the Spec's required cases.

## Required context

Parsing lives in the **check**, not the probe — the opposite call from `document-probe.ts`. The body is plain text, so parsing is pure string work, and putting it in Phase 2 is what lets a test pass a real `llms.txt` body as an inline string and exercise the parser without a network.

The aggregator is `async` because Section G is site-scope and owns its own Phase 1 probe, the shape `CLAUDE.md` describes for Section A. It takes the URL only — no `PageSnapshot`.

Presence needs more than a 200 because a single-page app or a custom error page answers `/llms.txt` with HTML at status 200 — the trap the product spec names for `openapi.json` at `agent-readiness-auditor-spec.md:109`.

The verdict conditions come from the llmstxt.org v2 format section, which calls the H1 "the only required section" and puts the payload in `##`-delimited file lists.

Relative imports in `scraper/src` use literal `.ts` extensions.

## Acceptance criteria

- [x] `captureLlmsTxt` fetches only `/llms.txt` at the origin root; no subpath file and no `llms-full.txt` is requested.
- [x] `captureLlmsTxt` returns a capture with an `error` string rather than throwing, for a DNS failure, a timeout and a non-2xx status.
- [x] `llmsTxtPresent` is synchronous and makes no network call.
- [x] `runSectionGAudit(url, rulebook)` returns exactly one finding, keyed `provenance.llms_txt`, whose `url` is the site root.
- [x] No Section G code path can return `fail`.
- [x] `llmsTxtFrom(overrides)` lives in `scraper/src/utils.ts` beside `snapshotFrom` and `documentFrom`.
- [x] Tests cover: 404 → `warn` with `found: false`; `text/html` 200 → `warn` with `looksLikeHtml: true`; `text/plain` 200 whose body begins `<!DOCTYPE html>` → `warn` with `looksLikeHtml: true`; a valid file with three links under `## Docs` → `pass` with `linkCount: 3`; the same file BOM-prefixed → `pass`; H1 only → `warn` with `hasH1: true`, `linkCount: 0`; links outside any `##` section → `warn` with `linkCount: 0`; links but no H1 → `warn` with `hasH1: false`; a valid file with no blockquote → `pass` with `hasBlockquoteSummary: false`; a capture carrying an `error` → `skip` with `reason: "llms.txt fetch failed"`; and the finding's `url` being the site root.
- [x] The test file drives off a written list of expectations, and nothing in a test catches what a check throws.
- [x] `pnpm lint` and `pnpm --filter scraper test` pass.

## Covers

- User Stories: 1, 2, 3, 7
- Requirements: 13-29, 32
- Testing Strategy: all check cases, and the `llmsTxtFrom` seam
- Interview Ledger: L1, L4, L6, L7

## Blocked by

1. `01-unscored-criterion-support.md` — the check reads `min_links` from the `provenance.llms_txt` entry, which does not exist until then.
