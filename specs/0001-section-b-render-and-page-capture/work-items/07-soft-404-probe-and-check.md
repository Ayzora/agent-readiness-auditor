---
type: Work Item
title: "Soft 404 probe and check"
parent: ../spec.md
status: done
---

## What to build

Soft 404 detection, in two halves either side of the Phase 1 / Phase 2 line.

**Phase 1 (network):** a site-level probe that makes one request to a URL that cannot exist — `/zzz-does-not-exist-<random>`. If it returns 200, the site soft-404s, and the response is then available as an error-page fingerprint to compare real pages against.

**Phase 2 (pure):** the `render.soft_404` check in `section-b/`, comparing a page against that fingerprint. Fails when a page returns a 200 status while showing error-shaped content; skips when the status is not 200.

A page that returns 200 while showing an error is silently invisible to every agent that trusts status codes.

## Required context

- Detecting soft 404s from page content alone is pattern-matching titles for "not found" and hoping. One request on a ~100-request budget buys reliability.
- The probe is **site-scope**, not page-scope, so it does not belong in `page-snapshot.ts`. It is closer in kind to Section A's `robots-audit.ts` and `rate-limit-probe.ts`.
- The check itself is pure and lives in `section-b/` with the other checks; `section-b/` must contain no network code, so the probe file lives outside it.
- Fingerprint comparison should use the shared `extractText` so that it compares normalised text, not raw markup — markup differs on nonces and timestamps even between two identical pages.
- The probe follows the same never-throw discipline as the rest of Phase 1: on failure the check returns `skip` rather than the audit aborting.

## Acceptance criteria

- [x] A site-level Phase 1 probe requests `/zzz-does-not-exist-<random>` once per site, with a fresh random suffix per run.
- [x] The probe records the status code and the error page's normalised text fingerprint.
- [x] The probe lives outside `section-b/`, and no network code is added to `section-b/`.
- [x] `render.soft_404` is a pure check emitting a `Finding`.
- [x] `render.soft_404` returns `fail` when a page returns 200 with error-shaped content matching the fingerprint.
- [x] `render.soft_404` returns `skip` when the page's status is not 200.
- [x] Evidence carries what the verdict rests on — the probe's status code and the fingerprint match.
- [x] The probe never throws; a probe failure degrades the check to `skip`.
- [x] `pnpm lint` passes.

## Covers

- User Stories: 3
- Requirements: 36
- Interview Ledger: L10

## Blocked by

- `01-text-extraction-and-finding-types.md`
- `04-section-b-skeleton-text-coverage-redirects.md`
