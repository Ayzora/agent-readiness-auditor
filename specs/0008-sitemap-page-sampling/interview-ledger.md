---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: What does "the crawler" change about what one run of the tool audits?

Recommended Answer:
- The unit of a run moves from one page to one site. `pnpm scraper <url>` still takes one URL, now treated as the seed.
- The run discovers pages, groups them into templates, samples about 40, captures each, and runs the existing sections over all of them.
- Out of this Spec: the sitewide text-coverage gate, the sitemap coverage gap, Section D's type appropriateness, Section E, and persistence.
- The Phase 1 / Phase 2 split holds: discovery and sampling live outside every section folder; Sections B, C and D run once per sampled page, unchanged; Section F receives every snapshot.

Answer: The sitemap is crucial. You provide the main URL of the site, we retrieve the sitemap and run the audit on the needed URLs from it. If the sitemap is unavailable, we audit only the provided URL and return a warning that the sitemap does not exist.

Decision: The sitemap is the only source of pages. There is no link-following discovery and no homepage crawl to depth 3. The rest of the recommended framing stands: the run audits a sample of the site's pages, and the listed features wait for their own Specs.

Reason: The spec's §5 asks for a depth-3 homepage crawl and DOM-skeleton clustering, which needs every discovered page downloaded — hundreds of requests against §6's budget of about 100. Reading one sitemap costs one request.

Negative Requirements:
- No following links from page to page to discover URLs.
- No homepage crawl to depth 3.

### L2

Status: current

Question: What happens when the site has no sitemap?

Answer: Audit only the provided URL and return a warning that the sitemap does not exist.

Decision: With no usable sitemap, the run audits the typed URL alone, exactly as today, and prints a one-line notice before any section output. The notice is not a finding.

Reason: `access.sitemap_present` already fails when no sitemap loads. A second finding would charge the site twice for one missing file.

Negative Requirements:
- No new criterion or finding for the missing sitemap.

### L3

Status: current

Question: How do we pick which sitemap URLs get audited?

Recommended Answer:
- Group URLs by path shape — same number of path segments and same first segment. `/products/red-shoe` and `/products/blue-hat` share `/products/*`; `/about` and `/pricing` are templates of their own. No downloads are needed to group.
- Sample 1 URL from every template, 3 from templates with more than 50 URLs, 5 from the largest template. Always include the typed URL. Hard cap of 40 pages per run.
- Over the cap, the largest templates win, and the run prints how many templates were left out.
- Within a template, take the first URLs in sitemap order, so two runs on the same sitemap audit the same pages.
- Report wording: "fails on 3 of 5 sampled pages in `/products/*` (2,140 URLs in the sitemap)" — never a claim to have measured pages that were not audited.
- Vocabulary: **template** for a group, **sampled page** for a chosen URL. Avoid "cluster" and "crawl".

Answer: Yes, path-shape grouping works.

Decision: Pages are chosen by path-shape grouping and per-template sampling as recommended.

Reason: It answers "which kinds of page does this site have?" at the cost of reading one file, and every step can be checked by hand. DOM-skeleton grouping was rejected because it needs every URL downloaded first.

Negative Requirements:
- No grouping by DOM or HTML skeleton.
- No random sampling.

### L4

Status: current

Question: How is the sitemap read when it is a sitemap index listing other sitemap files?

Recommended Answer:
- Open the index's child sitemaps in order, up to 10 child files or 50,000 URLs, and unzip `.xml.gz`.

Answer: I don't care about this edge case. If the site does not have a normal sitemap, we won't audit it.

Answer History:
- Recommended: follow up to 10 child sitemaps of an index.
- Final answer: an index is not followed; a site without a normal sitemap is treated as having no sitemap.

Decision: Only a normal sitemap (`<urlset>`) supplies pages. A sitemap index, or anything else that is not a `<urlset>`, is treated as no sitemap: the run audits only the typed URL and prints the notice. Section A's own verdict on the sitemap is unchanged.

Negative Requirements:
- No opening of a sitemap index's child files.
- No `.xml.gz` decompression.

### L5

Status: current

Question: How gently should the run load the site while it captures up to 40 pages?

Recommended Answer:
- One page at a time, with a 1-second pause between pages. No parallel captures.
- Section A's rate-limit ramp runs after all pages are captured, never alongside them.
- The interaction probe runs on every sampled page.
- Once-per-site probes run once, against the typed URL: agent probes, the soft-404 probe, llms.txt.
- A 15-minute limit on page capture. When it runs out, the remaining sampled pages are skipped, the run prints how many, and it scores what it has.
- One page failing never stops the run. A page that fails both halves is listed as unreachable and produces no findings. The run stops only when every page is unreachable.

Answer: Yes.

Decision: Page capture is sequential, paced, time-limited, and never overlaps the rate-limit ramp, as recommended.

Reason: The tool puts load on someone else's server with no opt-in, so the worst case must have a known size.

Negative Requirements:
- No concurrent page captures.
- The rate-limit ramp never runs during page capture.

### L6

Status: current

Question: With up to 40 pages, how should one page's result count toward the Scorecard?

Recommended Answer:
- Dimension scores are unchanged: every sampled page's findings count equally. No weighting by template size.
- Fix first ROI is unchanged: `weight × affected pages ÷ effort`, where affected pages are sampled pages that failed or warned — never estimated sitemap URLs.
- Each Fix first entry gains a template breakdown, for example `/products/*   3 of 5 sampled   (2,140 URLs in sitemap)`.
- Site-scope and document findings show no template line.

Answer: Yes, keep it measured-only.

Decision: Scoring counts measured findings only. Template sizes are shown beside Fix first entries as information and never enter the arithmetic.

Reason: Weighting by template size would let one large template drown out everything else, push site-wide problems such as robots.txt blocking every agent to the bottom, and put numbers on pages nobody audited.

Negative Requirements:
- No weighting of scores or ROI by template URL count.

### L7

Status: current

Question: What should the terminal output look like for a 40-page run?

Recommended Answer:
- A new `=== Pages ===` block first: the sitemap source, URL count, template count, sampled page count, then every template with its URL count and its sampled pages, templates not sampled because of the cap, and unreachable pages. With no sitemap, this block is the one-line notice.
- The per-page capture block shrinks to one line per page: status code, raw/rendered sizes, render time.
- Section blocks list only fails and warns individually, with URL and evidence. Passes and skips appear only in the block's count line.
- With a single page, output stays exactly as today, passes included.
- The Scorecard and Fix first are unchanged apart from the template breakdown.
- No new flags and no file output.

Answer: Yes.

Decision: Multi-page runs print a Pages block, one capture line per page, and only fails and warns per section. Single-page output is unchanged.

Negative Requirements:
- No new CLI flags.
- No writing results to disk.

### L8

Status: current

Question: How should grouping handle language prefixes and non-page URLs?

Recommended Answer:
- Skip a language segment when grouping, so `/en/products/x` and `/fr/products/x` join one template.
- Drop sitemap URLs whose path ends in `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.mp4`, `.zip`, `.xml`, `.json` or `.txt`.
- Same host only, `www.` ignored.
- Keep the query string for capture but ignore it for grouping; remove `#fragments`; drop duplicates.
- `/` is its own template and always sampled.
- The typed URL is always sampled, even when absent from the sitemap, and joins the template its path matches.

Answer: Pick only the English pages. Confirmed the refined rule: keep URLs with no language segment and URLs whose first segment is an English code; drop other language-prefixed URLs; grouping ignores the English segment; a site with no English at all keeps the typed URL's language; the typed URL is always sampled even if it is in another language; the rest of the recommendation stands.

Answer History:
- Recommended: treat every language segment as transparent and group all languages together.
- Final answer: sample English only, falling back to the typed URL's language when the site has no English.

Decision: Eligibility is English-or-unprefixed, same host, page-like URLs, with the recommended normalisation, and the language segment is ignored for grouping.

Reason: Without a language rule, `/en/products/x` and `/en/blog/y` fall into one template, and the same product in five languages takes five sample slots.

Examples:
- `/en/products/red-shoe` and `/products/blue-hat` → both in `/products/*`.
- `/fr/products/red-shoe` → dropped.
- A German-only site whose URLs are all under `/de/`, audited from `https://site.de/de/` → German URLs kept.

Negative Requirements:
- No sampling of non-English language variants when English exists.

### L9

Status: current

Question: Where does this live in the code, and how is it tested?

Recommended Answer:
- A Phase 1 sitemap download outside every section folder that never throws, and pure functions for reading the sitemap, grouping and sampling.
- Section A reads that same download instead of fetching the sitemap itself; its sitemap verdicts are unchanged.
- The limits (40 pages, 1/3/5 per template, 1-second pause, 15-minute limit) stay in code, not in `criteria.yaml`.
- Tests on the pure functions with inline sitemap XML; the download and the capture loop verified by hand.

Answer: This split is how every section has been built; it did not need asking.

Decision: The work follows the established Phase 1 / Phase 2 split and test conventions without further discussion. Section A reads the shared sitemap download, and the limits stay in code as politeness constraints.

Reason: The pattern is already the project's governing rule (CLAUDE.md). Only the shared download and the limits' location were new, and both follow existing precedent — the document-probe caps and the rate-limit ramp live in code.
