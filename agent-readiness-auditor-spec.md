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

### E. Action — can an agent transact?

- Forms: label association, `name` attribute, `autocomplete` tokens, submit reachable without JS, validation messages in DOM  
- CAPTCHA presence, type, and whether it fires on load or submit  
- `navigator.modelContext` / WebMCP tool registration and schema quality  
- Public API discoverability: `/.well-known/`, `/openapi.json`, `/swagger.json`, linked docs  
- Auth: any non-interactive credential path, or session-cookie only?  
- Critical funnel (cart / booking / contact) completable without JS-only interaction

### F. Documents

- PDFs: text layer vs. scanned image, tagged structure, page count, size  
- Key documents (pricing, specs, policies) PDF-only with no HTML equivalent  
- Documents behind login or form-fill

### G. Provenance — low weight, high credibility

- `llms.txt` / `llms-full.txt` present and non-stub  
- `security.txt`, machine-readable contact  
- Content licensing / AI-usage terms declared machine-readably

**Positioning note on G:** llms.txt sits at \~10% adoption, no major AI provider commits to consuming it, and Google has stated on the record it has no effect on Search or AI Overviews. Score it low **and say so in the report**, with the evidence. Every competitor in this space overstates it. Being the honest tool is a positioning asset, not a compromise. Same treatment for WebMCP: check for it, weight it low, note it's an origin trial with near-zero real deployment.

---

## 4\. Scoring model

Do **not** emit a single 0–100. Emit three things:

**1\. Seven dimension scores** (0–100 each), from weighted pass/fail within each dimension.

**2\. Blocking gates.** A small set of criteria that *cap* the total regardless of everything else:

| Gate | Cap |
| :---- | :---- |
| robots.txt disallows all AI agents | 20 |
| Live-fetch agents blocked at the edge | 25 |
| Sitewide `text_coverage_ratio` \< 0.15 | 40 |

Gates model reality correctly. Perfect JSON-LD behind a Cloudflare block is worth nothing, and a purely additive score would hide that.

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
