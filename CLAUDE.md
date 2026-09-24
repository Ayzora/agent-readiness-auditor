# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm workspace for the Agent-Readiness Auditor: a tool that audits a website
for how well AI agents (not humans) can access, read, understand, and act on
it. The full product design — scoring model, criteria taxonomy, data model,
crawl strategy, build order — lives in `agent-readiness-auditor-spec.md` at
the repo root. Read it before making architectural decisions; this file only
covers what exists today and the structural rules the spec insists on.

The codebase is at the early stage of that spec's build order: a `scraper`
package with Section A (Access — "can an agent get the bytes?"), Section B
(Render — "does the content exist without JavaScript?"), Section C
(Structure — "is the raw HTML shaped so an agent can read and navigate it?")
and Section D (Semantics — "are the page's facts declared machine-readably?")
implemented, Section F (Documents — "are the facts an agent needs locked
inside a linked file?") and Section G (Provenance — "has the site published
anything *for* agents?") implemented. The CLI takes one URL and audits a
sample of that site's pages, chosen from its sitemap (see *The sitemap
sample* below); with no usable sitemap it audits the typed URL alone. Pages
come from the sitemap only — nothing follows links from page to page — and
there is no database. Beside it sits a `web` package that is still an
unmodified `create-next-app` scaffold (plus one sample route proving routing
works). The rulebook, `scraper/criteria.yaml`, holds every criterion's
weight, report text, thresholds and Section D's required-property table, and
`scraper/src/scorecard.ts` scores one run's findings against it in memory.
`docs/scoring-pipeline.md` records how, and which of its steps are built.

### Thresholds come from the rulebook

Checks decide `pass`/`warn`/`fail` themselves, but never hold the cutoff
numbers: `index.ts` loads `criteria.yaml` once (`rulebook.ts`) and passes it
down, and each check reads its own numbers at the top with
`const { fail, warn } = thresholdsFor(rulebook, CRITERION)` from `utils.ts`.
Names are `fail`/`warn` where they fit and descriptive snake_case otherwise
(`min_text_chars`). A missing key or name throws, so a typo cannot silently
compare against `undefined`. Values that are facts rather than judgement calls
— the HTML spec's 300x150 default embed size, the rate-limit ramp — stay in
code.

### Two section shapes, on purpose

Sections do not all look alike, and the difference is a decision rather than
drift. What varies is the **scope** of the thing being fetched:

- **Site-scope sections** (Sections A and G) fetch resources that exist once
  per site — the agent probes, a rate-limit ramp, `/llms.txt`. Nothing else
  can share those bytes, so the section owns that Phase 1 work and exports an
  async `runSectionXAudit(url, …)`, a shape for site-scope work only. The one
  exception is robots.txt and the sitemap: the sitemap chooses the pages
  before any is captured, so `scraper/src/site-files.ts` fetches both once and
  Section A receives them:
  `runSectionAAudit(url, siteFiles, baselineRawHtml, rulebook)`.
- **Page-scope sections** (Sections B and C, and D–F when they land) all need the
  identical raw-and-rendered pair for a page. That capture therefore lives
  **outside** every section folder — `scraper/src/page-snapshot.ts` and
  `scraper/src/interaction-probe.ts` — and the section receives it as an
  argument. Putting the capture in `section-b/` would force Section D to
  import from `section-b/`, exactly the cross-section reach forbidden below.

So `scraper/src/section-b/` contains **only pure check functions and no
network code whatsoever** — not the capture-plus-checks mix `section-a/` has.

`runSectionBAudit(snapshot, interactions, soft404Probe, rulebook)` is **synchronous on
purpose**: a function that cannot `await` cannot fetch, so the signature
enforces the Phase 1 / Phase 2 rule below rather than a comment requesting it.
Making it `async` would silently permit I/O back into Phase 2 and destroy the
test seam — a future test constructs a `PageSnapshot` literal and a rulebook
and asserts on
the returned findings, with no network and no browser. Do not change it.

`scraper/src/soft-404-probe.ts` sits beside the capture layer for the same
reason in the other direction: it is site-scope Phase 1 work, so it cannot
live in `section-b/`, but it is not Section A's either.

The rule that has not changed: the root `scraper/src/index.ts` never reaches
into a section's internal files. It imports one aggregating function per
section, captures each sampled page **once**, and hands every snapshot to
each page-scope section.

### Section A

`scraper/src/section-a/` has the fetch/check split every other section has.
`section-a/index.ts` is its single public entry point: the async
`runSectionAAudit(url, siteFiles, baselineRawHtml, rulebook)` calls
`captureAccess(url, siteFiles)` and then the synchronous
`judgeAccess(url, capture, baselineRawHtml, rulebook)`, which returns the seven
`access.*` findings. The typed URL's **raw** HTML is the baseline the agent
probes are compared against; it is null when that page was unreachable.

- **Phase 1** is `capture.ts`: `captureAccess(url, siteFiles)` sends one agent
  probe per agent robots.txt allows on the audited page and runs the
  rate-limit ramp, and returns one plain **access capture** (`AccessCapture` in
  `types.ts`) — those plus the robots.txt and sitemap `site-files.ts` already
  fetched. It **never throws**: a failed fetch leaves its fields null and an
  `error` on its own part of the capture, so `index.ts` needs no
  `try`/`catch`. Every fetch goes through `got-scraping` with an explicit
  timeout and `retry: { limit: 0 }`. It runs only after every page capture has
  finished, so the ramp never overlaps one.
- **Phase 2** is pure checks beside the helpers they share: `robots.ts`
  (`agentsToProbe`, `robotsAllowsAgents`), `agent-probes.ts`
  (`probeOutcome`, `findPolicyDivergentAgents`, `payPerCrawlDetected`,
  `findBaselineMismatchedAgents`), `rate-limit.ts` (`rateLimitStop`,
  `rateLimit`) and `sitemap.ts` (`sitemapPresent`, `sitemapFresh`). Phase 1
  imports `agentsToProbe` and `rateLimitStop` to decide what to fetch next, so
  both phases apply one rule. `readRobots` lives in the root `robots-txt.ts`
  and `sitemapLoads` in `site-sample.ts`, because `site-files.ts` needs them
  too and a root module never imports from a section folder.

Rules the section is built around, recorded in
`specs/0007-section-a-correct-and-never-throw/spec.md`:

- **robots.txt is parsed in Phase 2** with `robots-parser`, the Section G
  split, so a test passes a robots.txt as a string. Its response follows
  RFC 9309: a 4xx allows every agent, and a 5xx or no answer disallows every
  agent, which fails `robots_allows_agents` and fires the cap-20 gate.
- **Site root for the gate, audited page for the probes.**
  `robots_allows_agents` judges each agent at the site root, so closing one
  folder cannot cap a whole site; an agent is probed only if robots.txt allows
  it on the audited page's path.
- **Each agent probe lands in exactly one outcome** — got through, asked to
  pay (402), blocked (challenged, or 400 and above but 402) or no answer — and
  each check reads only its own, so one refusal is never charged twice.
  `policy_divergence` counts blocked and no answer; `baseline_mismatch`
  compares only agents that got through.
- **A sitemap counts only when it loads as one**: a 200 whose body contains
  `<urlset` or `<sitemapindex`. A robots.txt `Sitemap:` line or an HTML shell
  answering 200 is not enough.

Not yet done, deliberately deferred: latency capture per agent probe, and
the sitemap coverage gap, which waits for its own Spec and can now read the
sample's templates.

### Section B

`scraper/src/section-b/` holds only pure checks over a captured
`PageSnapshot`: `text-coverage-and-redirects.ts`, `static-dom-checks.ts`,
`interaction-checks.ts` and `soft-404.ts`, aggregated by `section-b/index.ts`.
Like Section A, every check returns a `Finding` — `{ criterionKey, url,
status, evidence }`, with `status` one of `pass`/`fail`/`warn`/`skip`. Weight,
severity, title and fix text are deliberately absent: those are looked up in
the rulebook at scoring time, never copied onto a finding.

`skip` means the check **could not run**, and is excluded from scoring
entirely — not counted as a pass, which inflates, and not as a fail, which
defames. Every `skip` carries a distinct `reason` in its evidence.

Criterion keys use the **dimension**, never the section folder:
`render.text_coverage`, not `section-b.*`. See `GLOSSARY.md`.

Section A returns `Finding`s too (`access.*` keys). Site-scope findings use
the site root as their `url`.

### Section C

`scraper/src/section-c/` holds two pure checks — `extraction-ratio.ts` and
`link-navigation.ts` — aggregated by `section-c/index.ts`, which exports
`runSectionCAudit(snapshot, rulebook)`, synchronous for the same reason
Section B's is. Keys are `structure.*`.

Both read `snapshot.rawHtml` **only**, and neither ever falls back to
`renderedHtml`. A page whose text appears only after JavaScript therefore
fails Section C as well as Section B: that is what an agent receives, so it is
the intended answer rather than a gap to patch. When `rawHtml` is null both
return `skip` with `reason: "raw fetch failed"`.

Deliberately not built, and not oversights: heading hierarchy, semantic
landmarks, descriptive anchor text, every table check, and the Markdown
conversion noise ratio. `specs/0002-section-c-structure/spec.md` records why.
`link_navigation` reads HTML attributes only — it cannot see handlers attached
by script, and the rulebook's text for it must not imply otherwise.

### Section D

`scraper/src/section-d/` holds three pure checks over the page's JSON-LD —
`structured-data.ts` (`structuredDataPresent`, `structuredDataParses`) and
`required-properties.ts` — plus `json-ld.ts`, the one helper that parses the
blocks and collects the entities. All three checks read that helper's result,
so no two of them can disagree about what the page declares. Aggregated by
`section-d/index.ts`, which exports `runSectionDAudit(snapshot, rulebook)`,
synchronous for the same reason Section B's and Section C's are. Keys are
`semantics.*`.

Raw HTML only, like Section C, and here the reason was measured rather than
assumed: of twelve sites fetched raw, ten carried JSON-LD in the bytes, and the
six with none still had none after a full Playwright render. Structured data
injected by JavaScript is not there for the agents this tool measures, so it
cannot earn a pass.

Three rules the section is built around, each recorded in
`specs/0003-section-d-semantics/spec.md`:

- **An entity is a top-level object, an array member, or an `@graph` member
  carrying an `@type`.** An object nested inside a property — the `Offer` in
  `offers`, the `Person` in `author` — is part of its parent and is not an
  entity, or one `Product` would look like four declarations.
- **No warn, and no thresholds.** Section D's questions are binary, so no
  check calls `thresholdsFor` and none returns `warn`. What it reads from the
  rulebook instead is the per-type table, via `requiredPropertiesFor`, which
  throws on a missing table or an undefined type for the same reason
  `thresholdsFor` does.
- **A type absent from the table costs the page nothing.** `required_properties`
  returns `skip` with `reason: "no known types declared"` rather than failing a
  page for using a legitimate type the rulebook has no opinion about. The eight
  covered types are a starting set — a real run already turned up `ProductGroup`
  and `3DModel`, both unjudged.

The three checks also never charge a page twice for one problem: with no blocks
at all, `structured_data_present` fails while the other two `skip`.

Deliberately not built: OpenGraph, `dateModified`, validation against the
schema.org vocabulary, microdata and RDFa. Type appropriateness (does the
declared type match the page's template?) is deferred rather than cut — it waits
for its own Spec, which can now read the sample's templates.

### Section F

`scraper/src/section-f/` holds five pure checks over the run's linked PDFs —
`reachable.ts`, `html-equivalent.ts`, `text-layer.ts`, `tagged-structure.ts`
and `size.ts` — plus `sequences.ts`, the word-sequence helper
`html_equivalent` measures with. Aggregated by `section-f/index.ts`, which
exports `runSectionFAudit(snapshots, documents, rulebook)`, synchronous for the
reason Sections B, C and D are. Keys are `documents.*`.

Section F is the first section whose **subject is not a page**. A finding's
`url` is the document's own, criteria carry `scope: document`, and one file
linked from forty pages is fetched once and judged once — so `Finding` means
"one check, one subject, one outcome", the subject being a page, the site or a
document. `printFindings` names the subject whenever a section's findings cover
more than one.

The dimension's heavyweight is `documents.html_equivalent`: a **key document**
— pricing, specs, terms, policies, matched against the `key_topics` table on
that criterion and read through `keyTopicsFor` — whose text cannot be found in
the HTML captured this run. It is measured one-directionally, as the share of
the document's 8-word sequences present in the pages' raw text, because the two
texts are wildly different lengths and a symmetric similarity would punish a
page that genuinely carries the document's facts. Sequences shared by every
captured page are dropped first, but only from three pages upward — below that,
"on every page" would delete the corpus rather than its chrome.

Three rules the section is built around, recorded in
`specs/0004-section-f-documents/spec.md`:

- **A document that was never opened produces no findings but `reachable`.**
  Absent means we have no data and therefore no opinion; `skip` means we opened
  the file and the question does not apply, as for a non-key document under
  `html_equivalent`. Four skips per dead document would flood a report with
  rows that say nothing.
- **`documents.reachable` does not branch on why.** A login page, a 404, an
  edge challenge and a timeout all leave an agent with no document, so the
  check asks only whether the bytes began `%PDF-` and the evidence carries the
  cause. A branch-per-cause taxonomy was designed and rejected: every branch
  gave the same verdict.
- **A document the key-topic table has no opinion about costs the site
  nothing.** A manual, a datasheet or a printable form has no HTML equivalent
  by nature, so `html_equivalent` skips it — the same principle as Section D's
  unknown types.

A site linking no PDFs scores the dimension **N/A**, never 0, and never earns a
pass for the absence. `docs/scoring-pipeline.md` records the arithmetic.

Deliberately not built: Office formats and CSV (each is its own extraction
path), OCR of a scan, form-fill gating (the link is to an HTML landing page, so
discovery cannot see it), and judging PDFs on a third party's domain.

### Section F's probe is Phase 1, outside the section

`scraper/src/document-probe.ts` discovers the PDF links across the captured
snapshots, fetches them under caps, and parses them with `pdfjs-dist`. Parsing
lives there rather than in a check because it is I/O-shaped work with its own
failure modes, and because that is what lets a check test build a
`DocumentCapture` literal and skip the PDF library entirely. Like the capture
layer and Section A's capture, it **never throws**: the fetches are
sequential, so one timeout on document three must not cost the run documents
four to ten.

Its caps are politeness constraints, not tuning knobs, and they stay in code
for the same reason the rate-limit ramp does: at most 10 documents per run,
fetched one at a time, a 25 MB ceiling checked from `Content-Length` before any
body is downloaded, 15s per document and 90s overall, and only documents on the
site's own registrable domain. Treat a change to them as a safety-sensitive
change.

### Section G

`scraper/src/section-g/` holds the codebase's smallest section and its first
**unscored** criterion. `llms-txt-probe.ts` is a site-scope Phase 1 probe
exporting `captureLlmsTxt(url)`; `llms-txt.ts` is the pure check
`llmsTxtPresent(url, capture, rulebook)`; `index.ts` exports the async
`runSectionGAudit(url, rulebook)`. The key is `provenance.llms_txt`.

Like Section A and unlike B–F, the section owns its own Phase 1 work, because
`/llms.txt` exists once per site and no page snapshot can supply it. Unlike
Like Section A's capture, this one follows the capture layer's never-throw
discipline, so `index.ts` needs no `try`/`catch` around it.

Four rules the section is built around, recorded in
`specs/0005-section-g-provenance/spec.md`:

- **Parsing lives in the check, not the probe** — the opposite call from
  `document-probe.ts`. A PDF needs a library and has I/O-shaped failure modes;
  an `llms.txt` body is plain text, so deciding what it contains is pure string
  work. That is what lets a test pass a real `llms.txt` as an inline string.
- **A 200 is not presence.** A single-page app answers every path with its
  shell, so "found" needs a 200, a body that is not HTML by *both* the
  content-type and a sniff of the first bytes, and the H1 that llmstxt.org v2
  calls the only required section. The header test alone and the body test
  alone are each independently fooled.
- **Never `fail`.** `pass` when found with at least `min_links` file-list links,
  `warn` in every other case — absent, non-200, an HTML body, no H1, no links.
  `skip` only when the capture carries an `error`, the one case where no answer
  arrived and the check genuinely could not run. A site with no `llms.txt` is
  no harder for an agent to read.
- **Unscored, so none of that costs anything.** `criteria.yaml` marks the
  criterion `scored: false` and it carries no weight, so provenance is N/A in
  every run and prints as an observations block. `loadRulebook()` asserts that
  every *other* criterion carries a positive weight, which is what makes the
  flag safe: a forgotten `weight` throws and names the key instead of silently
  dropping a criterion out of the arithmetic.

Deliberately not built: `security.txt` (no reading agent fetches it), content
licensing and AI-usage terms in every form (no widely adopted convention
exists, and robots.txt agent blocks — the only signal agents consult — are
Section A's), `llms-full.txt` (v2 does not define it), and subpath files such
as `/docs/llms.txt`, which wait for their own Spec. A 1 MB body ceiling with a
`truncated` flag was specified and cut during implementation: a ceiling without
the flag would silently under-count links, so the two went together.

### The scorecard

`scraper/src/scorecard.ts` exports `scoreFindings(findings, rulebook):
Scorecard` — steps 5–11 of `docs/scoring-pipeline.md` over the findings array
`index.ts` collects from every section. It is **pure and synchronous** for the
reason the section aggregators are: no network, disk or database, so a test
builds findings and a rulebook as literals. It lives outside every section
folder because it reads every dimension. `printScorecard` in `print-report.ts`
prints it as `=== Scorecard ===` then `=== Fix first ===`, after every section
block. The word is **Scorecard** — never audit, report or result; see
`GLOSSARY.md`.

Rules it is built around, recorded in `specs/0006-scorecard/spec.md`:

- **A scorecard carries keys and numbers, never rulebook prose.** Titles, why,
  fix and gate reasons are read from the rulebook when printed, for the same
  reason a finding carries no title.
- **A warn earns `defaults.warn_credit` of its weight** (0.5), which
  `loadRulebook()` validates. A skip and an unscored criterion add to neither
  side.
- **A dimension with nothing available is N/A, never 0**; one whose criteria
  are all unscored is observational. The total is the unweighted **mean of the
  dimension scores**, never pooled, and is **withheld when access is N/A** —
  the gates are access criteria.
- **A gate fires when every finding for its criterion fails**, which is why
  `access.policy_divergence` fails only when every probed agent is blocked.
- **A finding whose key is not in the rulebook throws**, naming the key.

An unreachable site — `isUnreachable(snapshot)` in `page-snapshot.ts`, true
when both halves are null — stops the run after the capture with one line and
a non-zero exit. Section A cannot leave access empty any more — its capture
never throws and `robots_allows_agents` always returns `pass`, `warn` or
`fail` — so the withheld-total path has no trigger in a normal run and stays
only as a guard.

Deliberately not built: persistence, reading back and diffing
(`docs/scoring-pipeline.md` steps 4 and 12), and the sitewide text-coverage
gate, which waits for its own Spec.

### The sitemap sample

A run audits a sample of the site's pages rather than the one URL typed.
Recorded in `specs/0008-sitemap-page-sampling/spec.md`; *template* and
*sampled page* are defined in `GLOSSARY.md`.

- **Phase 1, before any page**: `site-files.ts` exports `captureSiteFiles(url)`,
  which fetches robots.txt and then the sitemap — the robots.txt `Sitemap:`
  lines in order until one loads, `/sitemap.xml` when it lists none. It never
  throws.
- **Phase 2**: `site-sample.ts` exports the pure `sampleSite(typedUrl,
  sitemaps)`, which returns either a `SiteSample` or a fallback reason, so a
  test passes sitemap XML as a string. Eligible URLs are same-host (`www.` and
  the scheme ignored), not a file by extension, fragment-free, and English or
  unprefixed — else the typed URL's language, else the sitemap's most common.
  A URL's template is its first path segment plus its segment count, the kept
  language segment and the query ignored: `/products/*`. Quotas are 5 for the
  largest template, 3 above 50 URLs, 1 otherwise, filled in two passes over the
  templates, largest first, up to 40 pages. The typed URL and `/` are always
  sampled.
- **Only a `<urlset>` supplies pages.** No sitemap, a `<sitemapindex>` (whose
  child files are never opened) or a urlset with no eligible URLs falls back
  to the typed URL alone, after a one-line notice that is not a finding.
  Section A still judges the sitemap from the same download, so an index
  still passes `access.sitemap_present`.
- **Capture**: `capture-pages.ts` exports `capturePages(urls)`, one page at a
  time with a 1-second pause and a 15-minute limit checked before each page. The
  sample is in capture order — the typed URL, `/`, every template's first page,
  then the top-ups — so the limit cuts the least representative pages first.
- **Scoring counts measured findings only.** Every audited page counts
  equally, and template sizes are shown beside Fix first entries by
  `templateBreakdown` at print time; they never enter a score or the ROI.
- **Output**: a multi-page run prints a `=== Pages ===` block, one capture line
  per page, and only fails and warns in each section block. A single-page run,
  including every fallback, prints what it always did plus the notice.

The 40-page cap, the 5/3/1 quotas and their 50-URL boundary, the pause and the
time limit are politeness constraints, like the rate-limit ramp: they stay in
code, not `criteria.yaml`, and a change to them is a safety-sensitive change.

### The report

Every run that produces a scorecard also saves a **report** — the Markdown
document showing that scorecard to the person who has to fix the site — to
`~/Downloads/<host>-<YYYY-MM-DD-HHmmss>.md`. Recorded in
`specs/0009-markdown-report/spec.md`.

- `scraper/src/report.ts` exports the pure `renderReport(input): string`, over
  the findings, the scorecard, the rulebook, the run's date and the sample (or
  fallback reason). No network, disk or clock, so the same input renders the
  same text — and a database era can call it on findings read back.
- Its parts, in order: Coverage, Headline, Access reality check, Fix first
  (with every affected subject's evidence in full), Observations (unscored
  criteria) and Not checked (every scored skip). Every sentence comes from the
  rulebook; the report writes no prose of its own, and reuses the terminal's
  wording through helpers exported from `print-report.ts`.
- The access table is rebuilt from the `access.*` findings' evidence, never the
  capture, for the same database-era reason.
- Text from the audited site goes in code spans and table cells escape `|`, so
  a site cannot break the Markdown.
- `index.ts` saves it last: never inside the repository, never over an existing
  file, never creating `~/Downloads`. A failed save prints
  `Report not saved — <reason>.` and leaves the exit code alone.

Deliberately not built: storing the report in the database, the Ignore list
(the rulebook has no content for it) and per-criterion evidence sentences.

## Prerequisites

- Node.js 23.6+ — the scraper is TypeScript that Node runs directly via type
  stripping; older Node either rejects it or needs a flag.
- pnpm 11, pinned via the root `packageManager` field. Run `corepack enable`
  once so the right version is picked up automatically.

## Commands

Run from the repository root unless noted.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install all workspace deps |
| `pnpm dev` | Next.js dev server on http://localhost:3000 |
| `pnpm build` | Builds every workspace package |
| `pnpm lint` | Lints every package — ESLint in `web`, `tsc --noEmit` in `scraper` |
| `pnpm scraper <url>` | Samples up to 40 pages from the site's sitemap (or only `<url>` without one), captures each, runs Section A's audit and Sections B, C, D, F and G's findings, then prints the scorecard and the Fix first list and saves the report to `~/Downloads` |
| `pnpm --filter scraper test` | Runs the scraper's tests — `node --test` over `src/**/*.test.ts` |
| `pnpm --filter <pkg> <cmd>` | Run a command against a single package, e.g. `pnpm --filter web build` |

Tests use Node's built-in runner, with no test-framework dependency. They
cover Sections A, C, D, F and G, Section F's link discovery, the sitemap
sample, the scorecard, the report, the rulebook loader and the unreachable
test; Section B is a follow-up. Section A's Phase 1 fetches, the robots.txt and
sitemap download, the page-capture loop and saving the report are verified by
hand, not unit-tested.

- `snapshotFrom(rawHtml, overrides)` in `scraper/src/utils.ts` builds the
  `PageSnapshot` a pure check reads, so a test needs no network and no
  browser. It lives outside every section folder because every section's tests
  will want it. `documentFrom(overrides)` beside it does the same for Section
  F's `DocumentCapture`, so no test needs a PDF file or the PDF library, and
  `llmsTxtFrom(overrides)` the same for Section G's `LlmsTxtCapture` — its
  default is a valid file, so a case states only the field it is about.
  `accessFrom(overrides)` does the same for Section A's `AccessCapture`; its
  default is a healthy site — every agent allowed and let through, a completed
  ramp, a robots.txt-listed sitemap with a recent `<lastmod>`.
  `findingFrom(overrides)` and `rulebookFrom(criteria, overrides)` do the same
  for the scorecard.
- Tests load the real `criteria.yaml` through `loadRulebook()`, so a threshold
  renamed in the rulebook but not in code fails loudly. Fixtures sit well
  inside a band, so retuning a cutoff does not break them. The one exception
  is the scorecard's arithmetic, which uses hand-built rulebooks with round
  weights: the scorer reads weight *values*, and pinning the real ones would
  make every weight change look like a bug. One scorecard test loads the real
  file and asserts shape only.
- A test file drives off a written list of expectations, never a directory
  listing: a fixture that goes missing must fail its own named test rather
  than quietly leave the suite. Nothing in a test may catch what a check
  throws — in `node:test`, throwing is how a test fails.
- The glob in the `test` script stays **quoted**. Unquoted, the shell expands
  it and `**` behaves as a single `*`, silently skipping anything not exactly
  one level under `src`.

## Environment files

Each package keeps its own `.env`, copied from the `.env.example` beside it:

```bash
cp web/.env.example web/.env
cp scraper/.env.example scraper/.env
```

- Next.js reads `web/.env` automatically; it will not look further up the
  tree.
- Node does **not** load `scraper/.env` on its own. If the scraper needs a
  real env var, its `start` script needs `--env-file-if-exists=.env` added.
- Keep each `.env.example` updated in the same commit as the variable that
  needs it — nothing enforces this.

## Architecture

### Workspace layout

- `web/` — Next.js 16 (App Router), React 19, Tailwind 4.
- `scraper/` — ESM TypeScript, built on got-scraping and Playwright, run without a
  build step (Node's type-stripping executes `.ts` files directly).

Both are private packages sharing the single root `pnpm-lock.yaml`. If they
ever need to share types, add a third workspace package rather than importing
across `web`/`scraper` with relative paths.

### Scraper module resolution

Relative imports in `scraper/src` use literal `.ts` extensions (e.g.
`import { rateLimitStop } from "./rate-limit.ts"` inside `section-a/`),
enabled by
`allowImportingTsExtensions` in `scraper/tsconfig.json`. Node's built-in type
stripping requires the imported extension to match the file on disk — it does
NOT rewrite `.js` specifiers to find `.ts` files. Keep new relative imports
in this package using real `.ts` extensions.

### The fetch/analysis split (governing rule for future work)

The spec calls this "the most important structural decision in the
codebase," and it should shape anything added to `scraper`:

- **Phase 1 (fetch)** does all network I/O — page snapshots, agent probes,
  rate-limit probing — and produces plain data (raw HTML, rendered DOM,
  headers, status, timing).
- **Phase 2 (check)** is pure functions over that data: `(snapshot, rule) =>
  finding`. No check function may make a network call.

This is what will eventually allow re-scoring without re-crawling, offline
unit tests against saved snapshots, and parallelizing only the slow phase.
Section A's own site-level fetches live in `section-a/capture.ts` for this
reason, and its checks are the Phase-2 pure functions that consume the access
capture.

Page-scope Phase 1 lives in `page-snapshot.ts`, `interaction-probe.ts` and the
loop over them in `capture-pages.ts`, and site-scope Phase 1 that is nobody's
section alone in `site-files.ts` and `soft-404-probe.ts` — all of them
outside the section folders, because Sections C–F need the same bytes. Every
Phase 1 module here degrades rather than throws: fields go null, an `error`
string is populated, and the checks reading them return `skip`. One dead page
must not abort an audit, and at 40 pages it must not.

### Planned data model (not yet implemented)

From the spec, worth knowing before adding persistence:

> YAML holds the questions. The database holds the answers.

Scoring rules, weights, and remediation text live in a versioned
`criteria.yaml` (git-tracked, identical across every audited site). Per-run
results (`site` → `audit` → `finding`, plus `task_run` in Phase 2) live in the
database and are never versioned — they're an event log. `finding.criterion_key`
is a foreign key into the YAML file, not a DB table.

### Rate-limit probe safety constraints

The rate-limit ramp in `scraper/src/section-a/capture.ts` intentionally puts
load on someone else's infrastructure — treat any change to it as a
safety-sensitive change, not just a perf one:

- Runs on every audit against the audited page, with no opt-in flag and no
  ownership check — about 45 requests over 12 seconds. This was a deliberate
  call: it measures what an agent actually meets, and a cached static asset
  may never reach the site's limiter.
- Hard cap at ~10 req/s, ramped gently (1 → 2 → 4 → 8 req/s, 3 seconds each),
  never following redirects.
- Each request has a 10-second timeout.
- Stops at the first 429, the first `Retry-After` header, or the first request
  with no answer. A 5xx does not stop it.

## ACT Workflow

ACT workflow storage for new Specs is configured in `.act/config.yaml`.

ACT workflow semantics, Workflow Storage selection, artifact vocabulary, and domain-doc guidance are defined in `.act/workflow.md`.
