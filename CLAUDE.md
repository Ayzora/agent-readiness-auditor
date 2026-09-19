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
implemented, run from a CLI against one URL given as an argument, and a
`web` package that is still an unmodified `create-next-app` scaffold (plus
one sample route proving routing works). There is no crawler, no scoring
engine and no database. The rulebook, `scraper/criteria.yaml`, exists and
holds every criterion's weight, report text, thresholds and Section D's
required-property table, but nothing scores with it yet.
`docs/scoring-pipeline.md` records the agreed shape of the scorer before it is
built.

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

- **Site-scope sections** (Section A) fetch resources that exist once per site
  — robots.txt, the sitemap, a rate-limit ramp. Nothing else can share those
  bytes, so the section owns its own Phase 1 probes and exports
  `runSectionAAudit(url, snapshot, rulebook)`. `runSectionXAudit(url)` is the shape for
  site-scope work only.
- **Page-scope sections** (Sections B and C, and D–F when they land) all need the
  identical raw-and-rendered pair for a page. That capture therefore lives
  **outside** every section folder — `scraper/src/page-snapshot.ts` and
  `scraper/src/interaction-probe.ts` — and the section receives it as an
  argument. Putting the capture in `section-b/` would force Section D to
  import from `section-b/`, exactly the cross-section reach forbidden below.

So `scraper/src/section-b/` contains **only pure check functions and no
network code whatsoever** — not the probes-plus-checks mix `section-a/` has.

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
section, performs the page capture **once**, and hands the result to both.

### Section A

`scraper/src/section-a/` holds every Section A fetch probe and check function,
with `section-a/index.ts` as the section's single public entry point: it
exports `runSectionAAudit(url, snapshot, rulebook)` — the URL for the site-scope probes,
the snapshot's **raw** half as the baseline the UA probes are compared against.

Section A's fetch probes (`section-a/ua-probe.ts`, `robots-audit.ts`,
`rate-limit-probe.ts`, `sitemap.ts`) and checks
(`payPerCrawlDetected`, `findPolicyDivergentAgents`,
`findBaselineMismatchedAgents`, all in `ua-probe.ts`) cover: per-agent
robots.txt allow/deny, a live UA probe per allowed agent, 402/pay-per-crawl
detection, policy-vs-reality divergence (robots.txt says allow but the agent
got challenged/blocked), baseline vs. agent text-length mismatch, the
rate-limit probe, and sitemap presence/freshness. Not yet done, deliberately
deferred: latency capture per UA probe, and sitemap coverage-gap-vs-crawl
(blocked on the crawler, which doesn't exist yet).

Section A's probes predate the never-throw discipline the capture layer
follows: on an unreachable host `gotScraping` rejects out of
`rate-limit-probe.ts`, so the root `index.ts` contains the call in a
`try`/`catch` rather than letting a dead page cost the run its Section B
findings. Fixing that in the probes is deferred along with migrating them off
Crawlee — see the note in the fetch/analysis split below.

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

Section A returns `Finding`s too (`access.*` keys), from small check functions
kept beside the probe whose data they read. Site-scope findings use the site
root as their `url`.

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
declared type match the page's template?) is deferred rather than cut — it needs
the crawler's clustering, which does not exist yet.

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
| `pnpm scraper <url>` | Captures one page, then runs Section A's audit and Sections B, C and D's findings against it |
| `pnpm --filter scraper test` | Runs the scraper's tests — `node --test` over `src/**/*.test.ts` |
| `pnpm --filter <pkg> <cmd>` | Run a command against a single package, e.g. `pnpm --filter web build` |

Tests use Node's built-in runner, with no test-framework dependency. They
cover Sections C and D; Sections A and B are a follow-up.

- `snapshotFrom(rawHtml, overrides)` in `scraper/src/utils.ts` builds the
  `PageSnapshot` a pure check reads, so a test needs no network and no
  browser. It lives outside every section folder because every section's tests
  will want it.
- Tests load the real `criteria.yaml` through `loadRulebook()`, so a threshold
  renamed in the rulebook but not in code fails loudly. Fixtures sit well
  inside a band, so retuning a cutoff does not break them.
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
- `scraper/` — ESM TypeScript, built on Crawlee + got-scraping, run without a
  build step (Node's type-stripping executes `.ts` files directly).

Both are private packages sharing the single root `pnpm-lock.yaml`. If they
ever need to share types, add a third workspace package rather than importing
across `web`/`scraper` with relative paths.

### Scraper module resolution

Relative imports in `scraper/src` use literal `.ts` extensions (e.g.
`import { robotsAudit } from "./robots-audit.ts"` inside `section-a/`),
enabled by
`allowImportingTsExtensions` in `scraper/tsconfig.json`. Node's built-in type
stripping requires the imported extension to match the file on disk — it does
NOT rewrite `.js` specifiers to find `.ts` files. Keep new relative imports
in this package using real `.ts` extensions.

### The fetch/analysis split (governing rule for future work)

The spec calls this "the most important structural decision in the
codebase," and it should shape anything added to `scraper`:

- **Phase 1 (fetch)** does all network I/O — page snapshots, UA probes,
  rate-limit probing — and produces plain data (raw HTML, rendered DOM,
  headers, status, timing).
- **Phase 2 (check)** is pure functions over that data: `(snapshot, rule) =>
  finding`. No check function may make a network call.

This is what will eventually allow re-scoring without re-crawling, offline
unit tests against saved snapshots, and parallelizing only the slow phase.
`section-a/robots-audit.ts` and `section-a/rate-limit-probe.ts` are
Phase-1-only site-level probes for this reason; the check functions in
`section-a/ua-probe.ts` (`payPerCrawlDetected`, `findPolicyDivergentAgents`,
`findBaselineMismatchedAgents`) are the Phase-2 pure functions that consume
their output.

Page-scope Phase 1 lives in `page-snapshot.ts` and `interaction-probe.ts`, and
site-scope Phase 1 that is nobody's section in `soft-404-probe.ts` — all three
outside the section folders, because Sections C–F need the same bytes. Every
Phase 1 module here degrades rather than throws: fields go null, an `error`
string is populated, and the checks reading them return `skip`. One dead page
must not abort an audit, and at 40 pages it must not.

Section A's remaining probes are **deliberately not migrated** to the direct
`got-scraping`/Playwright style, and not yet brought under the never-throw
rule. Refactoring working network code with no test suite is a poor trade; now
that Section B exists, that refactor is an informed decision to take
separately rather than a guess.

### Planned data model (not yet implemented)

From the spec, worth knowing before adding persistence:

> YAML holds the questions. The database holds the answers.

Scoring rules, weights, and remediation text live in a versioned
`criteria.yaml` (git-tracked, identical across every audited site). Per-run
results (`site` → `audit` → `finding`, plus `task_run` in Phase 2) live in the
database and are never versioned — they're an event log. `finding.criterion_key`
is a foreign key into the YAML file, not a DB table.

### Rate-limit probe safety constraints

`scraper/src/section-a/rate-limit-probe.ts` intentionally puts load on someone else's
infrastructure — treat any change to it as a safety-sensitive change, not
just a perf one:

- Hard cap at ~10 req/s, ramped gently (1 → 2 → 4 → 8 req/s).
- Aborts on first 429 or any `Retry-After` header.
- Hits one cheap static asset repeatedly, never dynamic pages.
- Per the spec, this check should stay opt-in and gated on verified domain
  ownership once that exists — it isn't gated yet.

## ACT Workflow

ACT workflow storage for new Specs is configured in `.act/config.yaml`.

ACT workflow semantics, Workflow Storage selection, artifact vocabulary, and domain-doc guidance are defined in `.act/workflow.md`.
