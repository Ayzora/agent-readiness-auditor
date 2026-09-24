---
type: Spec
title: Sitemap-driven page sampling
---

## Problem

Every run audits exactly one page, the URL given on the command line. A site is not one page. The homepage can be fully readable while every product page needs JavaScript, and a single-URL run cannot tell the difference.

Several features are waiting on having more than one page:

- **Section F's `html_equivalent`** compares a pricing PDF only against pages captured in the run. With one page, it fails the PDF even when `/pricing` exists.
- **The sitewide text-coverage gate**, the **sitemap coverage gap**, **Section D's type appropriateness** and **Section E** all need a set of pages grouped by kind.

The spec's §5 plans to find those pages by crawling the homepage to depth 3 and grouping them by DOM skeleton. That needs every discovered page downloaded before any of them is chosen. On a real site that means hundreds of requests, against §6's budget of about 100 for the whole audit. [L1] [L3]

## Proposed Outcome

`pnpm scraper <url>` audits a sample of the site, chosen from its sitemap. [L1]

1. **Read the sitemap.** robots.txt and the sitemap are fetched once, before any page. [L9]
2. **Find the eligible URLs.** The sitemap's URLs are filtered: English only, same host, and real pages only. [L8]
3. **Group into templates by path shape.** For example, `/products/red-shoe` and `/products/blue-hat` both go into `/products/*`. [L3]
4. **Pick the sampled pages.** 1, 3 or 5 per template, at most 40 pages. The typed URL and `/` are always included. [L3]
5. **Capture each sampled page.** Each is captured one at a time, raw and rendered with interactions, under a 15-minute limit. [L5]
6. **Run the sections.** Sections B, C and D run on every captured page, Section F on all of them together, and Sections A and G once for the site. [L1] [L5]
7. **Print the results.** First a `=== Pages ===` block, then only the fails and warns for each section. The Scorecard counts measured findings only, and each Fix first entry shows which templates it affects. [L6] [L7]

When there is no normal sitemap, the run does exactly what it does today on the typed URL, after printing a one-line notice. [L2] [L4]

## User Stories

1. As a site owner, I want the audit to cover the different kinds of page on my site, not just the one URL I typed. A problem on my product pages should show up even when my homepage is fine. [L1] [L3]
2. As a site owner with thousands of product pages, I want a few of them audited as representatives, and I want to be told how many URLs each representative stands for. [L3] [L6]
3. As a site owner without a sitemap, I want the tool to audit the URL I gave it and tell me plainly that it covered one page, not the site. [L2] [L4]
4. As a site owner with a multilingual site, I want the sample spent on different kinds of page, not on the same page in five languages. [L8]
5. As the operator of the tool, I want a run's load on the audited site to stay small and predictable: one page at a time, a known maximum number of pages, and a known time limit. [L5]
6. As a reader of the output, I want the problems across 40 pages without 600 lines of passes, and I want each problem tied to the templates it was found in. [L6] [L7]
7. As a site owner, I want site-wide problems, like robots.txt blocking every agent, to rank as highly as before, however many pages were sampled. [L6]

## Requirements

### Reading the sitemap

1. robots.txt and the sitemap are each fetched once per run, before any page is captured. The sitemap location is chosen as it is today: the robots.txt `Sitemap:` lines are tried in order until one loads, and `/sitemap.xml` is used when robots.txt lists none. [L1] [L9]
2. Only a sitemap whose loaded body is a `<urlset>` supplies pages. [L4]
3. Each of the following counts as **no usable sitemap**, and the run falls back to auditing the typed URL alone. [L2] [L4]
   - No sitemap loads.
   - The sitemap that loads is a `<sitemapindex>`.
   - The `<urlset>` contains no eligible URLs.
4. A sitemap index's child files are never opened, and `.xml.gz` files are never decompressed. [L4]
5. Section A judges `access.sitemap_present` and `access.sitemap_freshness` from that same download, and its verdicts are unchanged by this Spec. In particular, a loaded sitemap index still passes `access.sitemap_present`. [L4] [L9]
6. The fallback prints exactly one notice line before any section output, naming the cause and the one page being audited. [L2] [L4]
   - No sitemap loaded: `No sitemap found — auditing only <url>. Results cover one page, not the site.`
   - Index: `Sitemap is an index of other sitemaps, which this tool does not follow — auditing only <url>. Results cover one page, not the site.`
   - Empty: `Sitemap lists no auditable URLs — auditing only <url>. Results cover one page, not the site.`
7. The fallback notice is not a finding, adds no criterion, and costs no score. [L2]

### Eligible URLs

8. A sitemap URL is eligible only if its hostname equals the typed URL's hostname, with a leading `www.` ignored on both sides. The scheme is not compared. [L8]
9. A URL whose path ends in `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.mp4`, `.zip`, `.xml`, `.json` or `.txt` (case-insensitive) is not eligible. Linked PDFs are still discovered from page links by Section F, as today. [L8]
10. `#fragments` are removed, and URLs that are identical after removal count once. The query string is kept for capture. [L8]
11. A **language segment** is a first path segment matching two letters, optionally followed by a dash and two letters, case-insensitive (`en`, `fr`, `en-us`, `pt-BR`). [L8]
12. The language rule: [L8]
    - When at least one eligible URL has an English language segment (`en` or `en-xx`), the run keeps URLs with no language segment plus URLs with an English one, and drops every other language-prefixed URL.
    - When no URL has an English segment, the run keeps URLs with no language segment plus URLs in the typed URL's language.
    - When the typed URL has no language segment either, the run keeps the most common language segment in the sitemap. Ties go to whichever appears first.
13. The typed URL is always eligible and always sampled, even when it is missing from the sitemap, in another language, or on a `www.` variant. [L3] [L8]
14. The homepage `/` is always sampled. [L8]

### Templates

15. A URL's **template** is found in four steps. [L3] [L8]
    - Remove the language segment kept by requirement 12, if there is one.
    - Ignore the query string.
    - Take the remaining path segments. A trailing slash adds no segment.
    - The template is the first remaining segment plus the number of remaining segments.
16. A template's label is `/` for no segments. Otherwise it is `/<first>` followed by `/*` for each further segment: `/about`, `/products/*`, `/docs/*/*`. [L3]
17. A template's **size** is the number of eligible URLs in it, counting the typed URL and `/` when they were added. [L3]

### Sampling

18. Each template has a quota, never more than its size: [L3]
    - 5 for the largest template
    - 3 for any other template with more than 50 URLs
    - 1 for everything else
19. The typed URL and `/` are sampled first, and each counts toward its own template's quota. [L3] [L8]
20. Within a template, the remaining sampled pages are the first eligible URLs in sitemap order. Two runs on an unchanged sitemap therefore sample the same pages. [L3]
21. The total is capped at 40 sampled pages, including the typed URL and `/`. Slots are filled in two passes. Both passes visit templates in order of size, largest first, with ties going to the template whose first URL appears earlier in the sitemap. [L3]
    - Pass 1 gives each template its first sampled page.
    - Pass 2 tops each template up to its quota.
22. Templates that received no sampled page because of the cap are counted and reported. They are never silently dropped. [L3] [L7]

### Capturing pages

23. Sampled pages are captured one at a time with the existing raw-plus-rendered capture and interaction probe. There is a 1-second pause between the end of one capture and the start of the next. No captures run concurrently. [L5]
24. Page capture has a 15-minute limit, checked before each page starts. Pages not started when the limit is reached are not captured, and the run reports how many. The run then scores what it has. [L5]
25. A page whose raw and rendered halves both failed (`isUnreachable`) is listed as unreachable and produces no page findings. [L5]
26. The run stops with a non-zero exit only when every sampled page is unreachable. It prints one line, as the single-page run does today. [L5]

### Running the sections

27. Section A runs once, and its agent probes target the typed URL. The baseline is the typed URL's raw snapshot, which is null when that page was unreachable. [L5]
28. Section A's rate-limit ramp runs only after every page capture has finished, and never alongside one. [L5]
29. The soft-404 probe and Section G's llms.txt probe run once for the site. [L5]
30. Sections B, C and D run once per reachable sampled page, with their current signatures and behaviour. [L1]
31. Section F receives every reachable snapshot. Document discovery and its caps are unchanged. [L1]

### Scoring

32. Every sampled page's findings count equally toward dimension scores. Nothing is weighted by template size. [L6]
33. Fix first ROI stays `weight × affected subjects ÷ effort`, where affected subjects are the distinct sampled pages (or site, or documents) that failed or warned. Estimated sitemap URL counts never enter any score or ROI. [L6]

### Output

34. A multi-page run prints a `=== Pages ===` block before any other output. It contains: [L7]
    - the sitemap URL
    - the eligible URL count, the template count and the sampled page count
    - one line per template: its label, size, number sampled and sampled URLs
    - how many templates were not sampled because of the cap
    - how many pages were not captured because of the time limit
    - which sampled pages were unreachable
35. In a multi-page run, each captured page prints a single capture line: its URL, status code, raw and rendered size, and render time. [L7]
36. In a multi-page run, each section block keeps its count line, lists only `fail` and `warn` findings individually with URL and evidence, and omits individual passes and skips. [L7]
37. Each Fix first entry for a page-scope criterion gains a template breakdown, for example `/products/*   3 of 5 sampled   (2,140 URLs in sitemap)`. It has one line per template containing an affected page. Site-scope and document entries have no breakdown. [L6] [L7]
38. A single-page run, including every fallback, prints exactly what it prints today, passes included, plus the fallback notice. [L2] [L7]
39. No new CLI flags, and nothing is written to disk. [L7]

### Documentation

40. `CLAUDE.md` describes the sitemap-driven sample and drops its "there is no crawler" statement. The spec's §5 carries an *As built* note recording that pages come from the sitemap only and are grouped by path shape rather than DOM skeleton, and why. [L1] [L3]

## Technical Decisions

- **The download and the decisions are separate, following the established pattern.** A never-throwing Phase 1 module outside every section folder fetches robots.txt and the sitemap. Plain synchronous functions with no network turn the sitemap body into eligible URLs, templates and sampled pages. Sampling has no section folder, for the same reason `page-snapshot.ts` has none. [L9]
- **Section A stops fetching robots.txt and the sitemap itself.** It receives them from the shared capture, which already carries the robots.txt that decides where the sitemap is. Its `robots.txt`/sitemap judgement and its never-throw behaviour are unchanged. [L9]
- **The Scorecard keeps carrying keys and numbers only.** Template breakdowns are computed when printing, from the sample and the Scorecard's affected subjects. `scoreFindings` does not learn about templates. [L6]
- **The limits stay in code as politeness constraints**, like the rate-limit ramp and the document-probe caps: 40 pages, the 1/3/5 quotas with their 50-URL boundary, the 1-second pause and the 15-minute limit. Changing them is a safety-sensitive change. None of them go into `criteria.yaml`, which holds judgements about a site. [L9]
- **Vocabulary:** *template* and *sampled page* as defined in `GLOSSARY.md`. Not "cluster" or "crawled page". "Crawler" stays reserved for the agents being measured. [L3]

## Testing Strategy

- **Test Seam:** the pure sitemap-reading, eligibility, grouping and sampling functions. Tests pass sitemap XML and a typed URL as inline strings, then assert on eligible URLs, templates and sampled pages. There is no network. This follows the repo's convention of a written list of expected cases and no directory listing. [L9]
- **Cases covered, at minimum:**
  - a `<urlset>`
  - a `<sitemapindex>` → no usable sitemap
  - an HTML shell → no usable sitemap
  - a `<urlset>` with only ineligible URLs → no usable sitemap
  - other-host and `www.` URLs
  - non-page extensions
  - fragments and duplicates
  - query strings grouped together
  - `/en/` plus `/fr/` → English kept and the `en` segment ignored for grouping
  - `/de/`-only audited from a `/de/` URL
  - `/de/`-only audited from `/`
  - the typed URL missing from the sitemap and in another language
  - `/` missing from the sitemap
  - quotas of 1, 3 and 5
  - a template smaller than its quota
  - the 40-page cap with more templates than slots, largest templates winning, and the left-out count
  - two runs on the same sitemap producing the same sample
  [L3] [L4] [L8]
- **Section A's existing tests keep passing**, built with `accessFrom`, and its sitemap checks are asserted against the shared capture shape. [L9]
- **Verified by hand, not unit-tested:** the robots.txt and sitemap download, and the sequential capture loop with its pause and time limit, matching how Section A's Phase 1 fetches are verified. This is checked against at least one real site with a `<urlset>` sitemap, one with a sitemap index, and one with no sitemap. [L5] [L9]

## Out of Scope

- Discovering pages by following links, and the homepage crawl to depth 3. [L1]
- Grouping by DOM or HTML skeleton. [L3]
- Opening a sitemap index's child files, and decompressing `.xml.gz`. [L4]
- Concurrent page captures. [L5]
- Weighting scores or ROI by template size. [L6]
- New CLI flags and writing results to disk. [L7]
- Sampling non-English language variants when English exists. [L8]
- The sitewide text-coverage gate, the sitemap coverage gap, Section D's type appropriateness, Section E, and persistence. Each waits for its own Spec. [L1]

## Open Questions

- Should sampled pages that robots.txt disallows (for `*` or for the tool's desktop Chrome user agent) still be captured? Today the typed URL is captured regardless, and this Spec keeps that behaviour for every sampled page. This was not discussed.
- Requirement 12's last case, a site with no English audited from an unprefixed URL, falls back to the most common language segment. That rule was derived here, not discussed, so `act-refine-spec` should confirm it.
- The language-segment pattern also matches two-letter paths that aren't languages, such as `/us/…` or `/hr/…`. On such a site those URLs may be dropped as non-English. This is accepted for now.

## Follow-Ups

- The sitewide text-coverage gate, the sitemap coverage gap, and Section D's type appropriateness. Each can now read the templates and sampled pages this Spec produces.
- Section E (action), which needs to know which sampled page is the cart or booking page.

## Notes

- The two-pass slot filling in requirement 21 is the exact form of the agreed rule "largest templates win over the cap". It is spelled out so the sample is deterministic.
- A leftover `storage/` folder holding Crawlee statistics is still tracked in git, although Crawlee left the codebase in Spec 0007. It is unrelated to this Spec.
