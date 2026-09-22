# Agent-Readiness Auditor

**Version:** 0.2 **Date:** 16.08.2026 **Status:** MVP specification

---

## 1\. Overview

A tool that audits a website and reports how well AI agents can access, read, understand and act on it.

Most web optimisation assumes a human reader. Agents fail on different things: JavaScript-only content, bot-manager blocks, undeclared semantics, forms with no labels, PDFs with no text layer. This tool finds those failures and tells the site owner how to fix them.

**Two layers:**

| Layer | What it measures | Status |
| :---- | :---- | :---- |
| **1\. Deterministic audit** | Is the site *structurally* readable by agents | MVP |
| **2\. Task completion** | Can an agent *actually complete a job* on the site | Phase 2 |

Layer 1 produces the fix list. Layer 2 produces the headline number — the **Agent Cost Index** — and is the differentiator, but it is not in the MVP.

---

## 2\. Scope

### In scope (MVP)

- URL input → crawl → deterministic checks → scored report  
- Site archetype classification (SaaS / e-commerce / docs / publisher)  
- Template clustering so large sites are sampled, not exhaustively crawled  
- Re-run against the same site with a diff of what changed  
- Report as rendered markdown

### Explicitly out of scope (MVP)

| Cut | Reason |
| :---- | :---- |
| Knowledge graph of site content | Weeks of work, artefact not product. Falls out of the crawl later if wanted. |
| ChatGPT / Perplexity / Gemini visibility tracking | Separate product (AEO monitoring). Non-deterministic, needs longitudinal data, scraping treadmill. |
| Task-completion agent harness | Phase 2\. Build once Layer 1 ships. |
| Multi-tenant accounts, billing, auth | Phase 3\. |
| Fancy UI | A form and a report page. |

---

## 3\. Criteria taxonomy

Seven dimensions, ordered by causal dependency — if a site fails A, nothing downstream matters. This ordering is also the report's narrative spine.

### A. Access — can an agent get the bytes?

- `robots.txt` directives resolved per named agent: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, CCBot, Bytespider, Meta-ExternalAgent, Applebot-Extended  
- **Training-bot vs. live-fetch-bot distinction.** Blocking GPTBot is a defensible choice; blocking ChatGPT-User blocks a customer who asked about you right now. Most sites block both by accident.  
- **Live UA probe.** Fetch a representative URL with each agent UA. Compare **body hash**, not just status — bot managers return 200 with a challenge page. Record latency; a spike means a JS challenge agents can't solve.  
- **Policy vs. reality divergence.** `robots.txt` says allow, edge returns 403 → highest-value finding in the product. Marketing wrote the file, infra turned on Bot Fight Mode, nobody compared them.  
- 402 / pay-per-crawl responses — a deliberate commercial choice, not a misconfiguration. Different remediation advice.  
- Rate-limit threshold discovery *(gated — see §8)*  
- Sitemap: present, referenced from robots.txt, valid, `lastmod` freshness, coverage gap vs. crawl-discovered URLs

### B. Render — does content exist without JS?

- **Dual fetch.** Raw HTTP vs. headless-rendered. `text_coverage_ratio = len(raw_text) / len(rendered_text)`. The single most quotable per-page number.  
- Content behind interaction: accordions, tabs, "load more", hover reveals  
- Infinite scroll with no addressable pagination URLs  
- Consent/cookie wall blocking body content pre-consent  
- Soft 404s (200 status, error content)  
- Content in `<canvas>` or images without alt text  
- Same-origin iframes holding primary content

### C. Structure — is the content parseable?

- Mozilla Readability: `extraction_ratio = len(readable_text) / len(all_dom_text)`. Low ratio \= agent burns tokens on chrome.  
- Links: real `href` vs. JS click handlers — an agent cannot follow a click handler

Both read the **raw** HTML: what most agents actually receive.

*Cut on purpose:* heading hierarchy, landmarks, descriptive anchor text, tables (div grids, header cells, colspan, images-of-tables), and Markdown noise ratio. They are accessibility concerns a language model reads past, duplicate the extraction ratio, or cannot be detected reliably — div grids carry no signal in raw HTML without CSS, and the ones labelled `role="grid"` are mostly built by JavaScript and absent from raw HTML.

### D. Semantics — is meaning declared?

- JSON-LD present: at least one `<script type="application/ld+json">` block declaring an `@type`  
- JSON-LD parses: every block is valid JSON and declares a type. Broken markup is discarded whole by every reader, and the fix differs from "add markup"  
- **Required-property completeness per type** — `Product` without `offers.price`/`availability`, `Organization` without `sameAs`, `FAQPage` without `acceptedAnswer`. Cheap to check, most sites fail. Judged against a hand-written table of eight types in `criteria.yaml`, not against the schema.org vocabulary; a type the table does not cover costs the page nothing

All three read the **raw** HTML: structured data injected by JavaScript is not there for the agents this tool measures. That claim was tested — of twelve sites fetched raw, ten carried JSON-LD in the bytes, and the six with none still had none after a full browser render. Not one injected it with JavaScript.

*Cut on purpose:* OpenGraph, `dateModified` plausibility, validation against the schema.org vocabulary, microdata and RDFa. OpenGraph is a social-preview fallback that would add a low-weight consolation pass; `dateModified` is a narrow check better judged once real audit data exists; shipping and maintaining the vocabulary is weeks of work to catch mostly what the property table already catches.

*Deferred, not cut:* type appropriateness — does the declared type match the detected page template? (Product page typed only `WebPage` \= finding.) It needs the crawler's structural clustering to know what template a page belongs to, so it waits for §5.

**Positioning note on D:** search engines and retrieval systems consume schema.org today, and no AI provider publicly commits to parsing it. That is a difference in degree from `llms.txt`, not in kind, so weight this dimension moderately (5–6 per criterion, below render and structure) and say so in the report.

### E. Action — can an agent transact? *(deferred)*

Not specified for build. The dimension keeps its place in the taxonomy and its letter — `action.*` keys, a future `section-e/` — but nothing below is scheduled, and §4's seven dimension scores are six until it returns.

Action splits on a distinction the other dimensions never had to draw. A **reading agent** fetches HTML and extracts content, usually without executing JavaScript; that is what A–D are scored for, and why C and D read raw HTML only. An **acting agent** drives a real browser to complete a task, running JavaScript, clicking and typing. Only the second can transact, so every check here would be scored for it — and none of them could reuse A–D's raw-only rule.

*Cut on purpose:* **form label association and `autocomplete` tokens.** These are accessibility checks that Lighthouse and axe have made for a decade. An acting agent reading a screenshot sees a visual label whether or not a `<label for>` ties it to the control, and one reading the DOM infers from adjacent text. Shipping an accessibility rerun under an agent-readiness banner is the overstatement G positions this tool against.

*Cut on purpose:* **submit reachable without JS.** Aimed at no real consumer — reading agents never submit, acting agents run JavaScript. What it measures is JavaScript dependence, which is `render.text_coverage`'s job.

*Cut on purpose:* **validation messages in the DOM.** Only observable after a form submission this tool will never perform on someone else's site.

*Cut on purpose:* **auth.** Whether a non-interactive credential path exists is not answerable from outside without an account. A login form and a `WWW-Authenticate` header are the whole of what can be seen.

*Cut on purpose:* **CAPTCHA.** Detecting one is easy and reliable — vendors load from a handful of known domains — but the finding is worthless. A CAPTCHA is a deliberate choice the owner already knows they made. The case worth reporting is the challenge the owner did **not** choose knowingly: a bot manager silently challenging agent traffic it deems suspicious. Section A's UA probe already catches that as `access.policy_divergence`, so scoring a CAPTCHA widget on top of it would charge a page twice for one problem.

*Survives, but does not carry a dimension:* public API discoverability (`/.well-known/`, `/openapi.json`, `/swagger.json`, linked docs — where a 200 is not a pass, since a single-page app returns its shell for any path, so the body must parse and declare `openapi` or `swagger`) and `navigator.modelContext` / WebMCP tool registration. Both are cheap and both are real, but both are absent from the large majority of sites. A dimension built from them alone scores a restaurant 0 for not publishing an OpenAPI spec, or skips both and produces no score at all. Choosing between those is a scoring-model decision, not a Section E one.

*Deferred, not cut:* **critical funnel completability** (cart / booking / contact) and whether a page's controls can be **operated** at all — a `div` dropdown with no role, a date picker that answers only mouse events. These carry the real transaction signal, and a human clicks straight past both. Both need §5's structural clustering to know which page is the cart, and the crawler does not exist yet. Pick Section E up after it lands.

### F. Documents

Five checks over the site's linked PDFs, discovered from the **raw** HTML of every page captured in a run, deduplicated by URL and fetched once each however many pages link them. The finding's subject is the file, not the page that linked it.

- **`documents.html_equivalent`** — the heavyweight. A **key document** (pricing, specs, terms, policies — matched against a keyword table in `criteria.yaml`) whose content cannot be found in the site's HTML. Measured as the **document coverage ratio**: the fraction of the document's 8-word sequences present in the run's captured HTML, one-directionally, with sequences shared by every page dropped so navigation cannot manufacture a match
- **`documents.text_layer`** — extractable characters per page. A scan is a photograph of text and readable by nobody
- **`documents.reachable`** — did PDF bytes arrive? A login page, a 404, an edge challenge and a timeout all leave an agent with no document, so the check does not branch on which
- **`documents.tagged_structure`** — does the file declare headings and reading order, or does its text arrive in storage order
- **`documents.size`** — bytes and page count past the point an agent skips the file

The dimension's claim is that facts locked inside a PDF are facts an agent will not have: retrieval systems handle HTML far better, and many reading agents fetch a page without following its document links. The report must say that PDFs *are* readable by some agents, so the cost is unreliability rather than impossibility. A site linking no documents scores this dimension **N/A**, never 0, and never earns a pass for the absence.

*Cut on purpose:* **Office formats and CSV.** Discovery is format-neutral, but inspection is not — a `.docx` is a zip of XML with nothing in common with a PDF — so each format is its own extraction path and failure set, for content that is rare on public sites.

*Cut on purpose:* **a taxonomy of fetch failures.** Every branch produced the same verdict, so the cause lives in the evidence instead.

*Cut on purpose:* **form-fill gating.** "Download our guide" behind a lead-capture form links an HTML landing page, not a `.pdf`, so discovery cannot see it.

*Cut on purpose:* **judging PDFs on a third party's domain**, which are not the audited owner's to fix, and **OCR** of a scan, which would repair the defect rather than report it.

*Weakened until §5 lands:* `html_equivalent` can only compare against pages captured in the run, so auditing a single URL fails a pricing PDF even when `/pricing` exists. The crawler's ~40 pages are what make the comparison honest.

### G. Provenance — measured, deliberately not scored

One check: **`provenance.llms_txt`** — is there an `/llms.txt` at the origin root, and is it more than a stub? Found requires a 200, a body that is not HTML by both content-type and sniff, and the H1 the llmstxt.org v2 format calls "the only required section". Non-stub requires at least one file-list link under a `##` heading. The verdict is `pass`, `warn` or `skip`, and never `fail`: a site without one is no harder for an agent to read.

`llms-full.txt` is not fetched — v2 does not define it — and subpath files such as `/docs/llms.txt`, which v2 does permit, wait for the crawler.

*Cut on purpose:* **`security.txt`.** The audited consumer is a reading agent, and no reading agent fetches it. It is an address for security researchers, not a machine-readable contact an agent acts on. Measuring it would widen the dimension without serving the consumer the tool is built for.

*Cut on purpose:* **content licensing and AI-usage terms.** There is no widely adopted convention for declaring usage terms to an agent. IETF `aipref` is a draft, RSL is months old, TDM `tdmrep.json` has near-zero adoption, `noai` meta tags are honoured by nobody, and `<link rel="license">` declares copyright rather than AI permission. The only signal agents actually consult is robots.txt agent blocks, which Section A already reads as `access.robots_allows_agents` — so a licensing criterion would both double-charge for one thing and produce advice a site owner cannot act on. This is the same trade §3 E made when it cut CAPTCHA detection: easy and reliable to detect, worthless as a finding.

**Positioning note on G:** this dimension is **unscored**. `criteria.yaml` marks the criterion `scored: false`, it carries no weight, and provenance therefore produces no dimension score in any run — the N/A case, by construction.

The 2024 picture this section previously carried is out of date, and the replacement is not flattering in the other direction either. The llmstxt.org v2 proposal reports thousands of publishing sites, automatic generation by several documentation platforms, and Lighthouse auditing for it; those figures are the proposal author's own. Independent measurement is bleaker: SE Ranking, across ~300,000 domains, finds ~10% adoption and **no statistically significant correlation** between publishing an `llms.txt` and being cited in AI answers; Ahrefs, across ~137,000 domains, finds **97% of published files received zero requests** in a month. Google has stated on the record that it does not support the convention and does not plan to. No major AI provider commits to reading one.

So: publishing one is an afternoon's work and plausibly worth doing, and there is no defensible basis for moving a site's score over it. Report it, show the evidence, charge nothing. Every competitor in this space overstates this dimension; being the honest tool is a positioning asset, not a compromise.

WebMCP and API discoverability (`/openapi.json`, `/.well-known/`) remain unassigned to any dimension — see §3 E, which cut them from Action for the same reason they are not here: both are absent from the large majority of sites, and a dimension built from them alone either scores a restaurant 0 for not publishing an OpenAPI spec or produces no score at all.

---

## 4\. Scoring model

Do **not** emit a single 0–100. Emit three things:

**1\. Six scored dimension scores** (0–100 each), from weighted pass/fail within each dimension, plus **one observational dimension**. Provenance (§3 G) is measured and reported but carries no weight, so it produces no score and is rendered as an observations block rather than a number. A criterion marked `scored: false` in `criteria.yaml` is excluded from both the earned and the available totals — never counted as a pass, which inflates, and never as a fail, which defames.

**2\. Blocking gates.** A small set of criteria that *cap* the total regardless of everything else:

| Gate | Cap |
| :---- | :---- |
| robots.txt disallows all AI agents | 20 |
| Live-fetch agents blocked at the edge | 25 |
| Sitewide `text_coverage_ratio` \< 0.15 | 40 |

Gates model reality correctly. Perfect JSON-LD behind a Cloudflare block is worth nothing, and a purely additive score would hide that.

*As built (Spec 0006):* the "total" the gates cap is the unweighted mean of the scored dimension scores — each dimension counts once however many findings it holds — and it never leads the report: the dimension scores are always printed above it, which is how "do not emit a single 0–100" is honoured. A gate fires when every finding for its criterion fails; "blocked at the edge" is `access.policy_divergence` failing, which it does only when every probed agent is blocked. The sitewide `text_coverage_ratio` gate waits for the crawler, since "sitewide" means nothing on one page.

**3\. Agent Cost Index** — Phase 2 only. Median tokens \+ steps to complete the archetype task set, indexed against a benchmark cohort.

Every criterion carries `weight`, `severity`, and `remediation_effort` (S/M/L). Effort is what lets the report sort findings by **ROI** — `weight × affected_pages ÷ effort` — rather than by severity alone. Sorting by ROI is what makes the report actionable rather than overwhelming.

---

## 5\. Crawl strategy — template clustering

You cannot audit 10,000 pages and you don't need to. Sites are templates.

1. Seed from sitemap \+ homepage crawl to depth 3  
2. **Cluster URLs by structural fingerprint** — normalise the DOM to a tag/class skeleton, hash it, group. All product pages collapse into one cluster.  
3. Sample per cluster: 1 always, 3 for clusters \>50 URLs, 5 for the largest  
4. Always force-include: homepage, pricing, contact, about, everything in primary nav, first sitemap entry per path prefix

Audit \~40 pages, report as *"affects 3,200 pages in the product-detail template."* That framing is worth more than exhaustive crawling and costs 1% as much.

---

## 6\. Architecture — fetch phase, then analysis phase

**Strict separation. This is the most important structural decision in the codebase.**

\# PHASE 1 — network. Slow. Happens once.

snapshot \= fetch\_page(url)

\# → {raw\_html, rendered\_dom, headers, status, timing}

\# PHASE 2 — pure functions. Fast. No I/O allowed.

for rule in rules:

    findings.append(CHECK\_FNS\[rule\["key"\]\](snapshot, rule))

**No check function may make a network call.** The handful that need extra network work (UA probe, rate limits) live in Phase 1 as explicit site-level probes.

This buys three things nearly free:

- **Re-scoring without re-crawling.** Persist snapshots; add criterion \#31 and re-run all checks against yesterday's data in seconds.  
- **Trivial testing.** Save a snapshot as a fixture, unit-test every check offline.  
- **Parallelism.** The slow part is one clearly-bounded phase you can pool.

### Request budget

| What | Requests |
| :---- | :---- |
| robots.txt, sitemap, llms.txt, security.txt, openapi.json | \~5 |
| UA probe (12 agents × 1 representative URL) | \~12 |
| Per page: raw HTTP \+ headless render | 2 × 40 \= 80 |
| **Total for a 40-page audit** | **\~100** |

\~100 requests produce \~1,200 findings. Findings are output records, not network calls.

---

## 7\. Data model

**The governing rule:**

> **YAML holds the questions. The database holds the answers.**

|  | YAML files | Database tables |
| :---- | :---- | :---- |
| Contains | Rules, weights, prose, "what good looks like" | Observations, results, "what we found" |
| Same for every site? | Yes — identical for site \#1 and site \#500 | No — different every site, every run |
| Written by | You, in your editor | The program, at runtime |
| Versioned by | Git | Not versioned; it's an event log |

### 7.1 Rulebook — `criteria.yaml`

version: v0.3.0

criteria:

  \- key: robots.blocks\_live\_fetch

    dimension: access

    scope: site

    weight: 10

    severity: critical

    effort: S

    title: "Live user-initiated AI fetches are blocked"

    why: \>

      ChatGPT-User and Claude-User fetch a page because a real person

      asked about you right now. Blocking them blocks customers.

    fix: "Add Allow rules for ChatGPT-User and Claude-User in robots.txt"

  \- key: render.text\_coverage

    dimension: render

    scope: page

    weight: 9

    severity: critical

    effort: L

    threshold: 0.6

    title: "Content requires JavaScript to appear"

    why: \>

      Many agents fetch raw HTML without executing JS. If most of your

      text only appears after render, they see an empty page.

    fix: "Server-render primary content, or provide a static fallback"

  \- key: schema.product\_offers

    dimension: semantics

    scope: page

    weight: 6

    severity: high

    effort: S

    applies\_to: \[ecommerce\]

    title: "Product schema missing price or availability"

    why: "Shopping agents filter on price. Missing it makes you invisible."

    fix: "Add offers.price and offers.availability to your Product JSON-LD"

gates:

  \- criterion: robots.blocks\_live\_fetch

    cap: 20

Changing a weight is: edit file → bump `version` → commit → tag. Git is the versioning system, which is why there is no `criterion` table.

### 7.2 Task packs — `tasks/{archetype}.yaml` *(Phase 2\)*

archetype: saas

tasks:

  \- key: find\_midtier\_price

    prompt: "What does the mid-tier plan cost per month?"

    success: numeric\_match

  \- key: find\_sales\_contact

    prompt: "How would I contact the sales team?"

    success: url\_or\_email\_found

Per-archetype, not per-site. Write the SaaS pack once and it runs against every SaaS site. Per-site task authoring makes this a consultancy, not a product.

### 7.3 Tables

site  →  audit  →  finding

                →  task\_run   (Phase 2\)

site

  id

  url                 \-- normalised, unique

  archetype           \-- 'saas'|'ecommerce'|'docs'|'publisher'|null

  created\_at

audit

  id

  site\_id             \-- → site.id

  ruleset\_version     \-- git tag, stamped at start, e.g. 'v0.3.0'

  status              \-- 'running'|'done'|'failed'

  total\_score

  gate\_applied        \-- which gate capped the score, null if none

  dimension\_scores    \-- jsonb: {"access":80,"render":45,...}

  pages\_crawled

  report\_md

  created\_at

finding

  id

  audit\_id            \-- → audit.id

  criterion\_key       \-- 'render.text\_coverage' — points into criteria.yaml

  url                 \-- null for site-level checks

  status              \-- 'pass'|'fail'|'warn'|'skip'

  evidence            \-- jsonb: selector, snippet, ratios, status codes

**Phase 2 only:**

task\_run

  id

  audit\_id

  task\_key

  model

  attempt\_no

  completed           \-- bool

  steps

  tokens

  failure\_mode        \-- blocked|not\_found|hallucinated|timeout|captcha|partial

  trace               \-- jsonb array of steps

### Purpose of each table

| Table | Purpose |
| :---- | :---- |
| `site` | The domain being audited. One row, permanent. `archetype` selects the task pack. |
| `audit` | One run. Every summary number plus the rendered report. The row you diff against last time. `ruleset_version` pins it to the rulebook as it existed that day, so a weight change in November doesn't retroactively invalidate an August score. |
| `finding` | One check, one page, one outcome. \~1,200 rows per audit. Three jobs: every report line comes from here, the re-run diff is a join on it, and `evidence` makes findings arguable-with-facts. |
| `task_run` | Did an agent complete the job. One row per task × model × attempt. Separate from `finding` because cardinality differs (6 rows per key vs. 1), it has real numeric columns to aggregate, and its status is an enum not pass/fail. |

### 7.4 Indexes

create index on finding (audit\_id, criterion\_key);

create index on finding (audit\_id, status);

create index on audit (site\_id, created\_at desc);

### 7.5 What deliberately isn't a table

| Not a table | Lives in | Why |
| :---- | :---- | :---- |
| `criterion` | `criteria.yaml` | Git versions it. Identical for every site. |
| `task_def` | `tasks/*.yaml` | Same. |
| `crawl` | folded into `audit` | At MVP, one crawl \= one audit, always. |
| `page` | `finding.url` \+ evidence | Per-page metrics are findings with a number in evidence. |
| `dimension_score` | `audit.dimension_scores` | Seven values read together, never queried across. |
| `task_step` | `task_run.trace` | Only read for one run at a time, to render it. |
| `report` | `audit.report_md` | Regenerating prose is an UPDATE. |

---

## 8\. Execution flow

**1\. Resolve site** — upsert on normalised URL, classify archetype.

**2\. Open audit** — insert with `status='running'`, stamp `ruleset_version` **now**.

**3\. Load rulebook** — parse `criteria.yaml` into a dict. Read-only for the rest of the run.

**4\. Fetch (Phase 1\)** — site-level probes, then discover → cluster → sample → dual-fetch each page. No checking happens here.

**5\. Check (Phase 2\)** — every criterion key maps to a pure function `(snapshot, rule) → finding`. The function returns pass/fail and evidence only; weight, severity, title and fix text all come from `rule`.

**6\. Write findings** — one batched insert, \~1,200 rows, milliseconds.

**7\. Score** — read findings back, look up weights in the YAML dict, sum, apply gates. **This is where file and database join: `finding.criterion_key` is a foreign key pointing into a YAML file.** Because scoring is separate from checking, changing a weight and re-scoring costs a function call, not a re-crawl.

**8\. Close audit** — update with score, gate, dimension scores, report.

**9\. Render report** — group failing findings by criterion, join each to its YAML entry for title/why/fix, sort by ROI.

### Rate-limit probe — safety constraints

This is the only check that puts meaningful load on someone else's infrastructure. Done carelessly it's indistinguishable from a small DoS.

- Hard cap at \~10 req/s. Never higher.  
- Ramp gently: 1 → 2 → 4 → 8 req/s, a few seconds each, abort on first 429  
- Request one cheap static asset repeatedly, never expensive dynamic pages  
- Never run in parallel with the main crawl  
- Honour `Retry-After` immediately and stop  
- **Opt-in, and only on domains with verified ownership** (DNS TXT record or a file at a specified path)

Ownership verification is worth building anyway — it gates this check and gives you a natural free/paid tier boundary later.

---

## 9\. The re-run — the retention loop

The product's loop is **audit → fix → re-audit → show progress.** That loop is why `finding` is a table of rows rather than one JSON blob.

select

  coalesce(o.criterion\_key, n.criterion\_key) as criterion\_key,

  coalesce(o.url, n.url) as url,

  o.status as was, n.status as now

from finding o

full join finding n

  on o.criterion\_key \= n.criterion\_key

 and o.url is not distinct from n.url

 and n.audit\_id \= $new

where o.audit\_id \= $old

  and o.status is distinct from n.status;

Output:

robots.blocks\_live\_fetch  (site)      fail → pass   ✅ resolved

render.text\_coverage      /features   fail → pass   ✅ resolved

render.text\_coverage      /blog/x     pass → fail   ⚠️  regressed

schema.product\_offers     /new-page     —  → fail   🆕 new

*Score 34 → 71\. Gate lifted. 14 resolved, 3 regressed, 2 new.*

One query. Regressions surface automatically — which is the thing that turns a one-off report into something worth re-running.

---

## 10\. Report structure

Not a checklist dump. Four sections:

1. **Headline** — score, dimension breakdown, which gates fired, one sentence on the single biggest cost  
2. **Access reality check** — the robots.txt vs. edge-behaviour table. Lead with it; it's the finding most likely to be genuinely news to the reader.  
3. **Findings by ROI** — sorted `weight × affected_pages ÷ effort`, each with evidence (selector, snippet, screenshot ref) and a concrete fix, ideally a code snippet  
4. **Ignore list** — things that look like problems but aren't, with reasoning. Counterintuitively this is what makes the rest credible.

---

## 11\. Open decisions

**Where the agent boundary sits (Phase 2).** Two viable designs, measuring different things:

| Option | Measures | Cost | Notes |
| :---- | :---- | :---- | :---- |
| (a) Browser-use loop with page-interaction tools | The *browsing* experience | High | Closer to the agentic-web thesis; more defensible |
| (b) Fetch/search tool over the crawled corpus | The *retrieval* experience | \~5× cheaper | Closer to the AI-search question |

Leaning (a). Real fork — decide deliberately.

**Ground truth (Phase 2).** Fully automated grading means the grader can be wrong in the same direction as the subject, and scores quietly become meaningless. One human confirmation pass per site is \~10 minutes and makes every subsequent run trustworthy.

**Hosting.** Playwright \+ Chromium rules out Vercel serverless. Fly.io or a container on the existing VPS. This dictates the interface design: job queue \+ polling, not request/response.

---

## 12\. Build order

| \# | Deliverable | Target |
| :---- | :---- | :---- |
| 1 | Single hardcoded site, no UI, no DB. Fetch phase \+ 5 checks. Print findings to terminal. | **7 days** |
| 2 | `criteria.yaml` with \~20 criteria \+ check functions. Still terminal output. | \+5 days |
| 3 | Postgres, 3 tables, scoring, gates. | \+4 days |
| 4 | Crawl \+ template clustering \+ sampling. | \+5 days |
| 5 | Markdown report generation, ROI sorting. | \+3 days |
| 6 | Web form \+ job queue \+ report page. | \+5 days |
| 7 | Re-run diff. | \+2 days |
| — | *Phase 2: task harness, `task_run`, Agent Cost Index* | *later* |

**Step 1 is the gate.** If a terminal script printing five findings against one hardcoded URL doesn't exist in seven days, the spec isn't the blocker.  
