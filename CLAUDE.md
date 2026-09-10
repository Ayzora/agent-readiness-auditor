# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm workspace for the Agent-Readiness Auditor: a tool that audits a website
for how well AI agents (not humans) can access, read, understand, and act on
it. The full product design — scoring model, criteria taxonomy, data model,
crawl strategy, build order — lives in `agent-readiness-auditor-spec.md` at
the repo root. Read it before making architectural decisions; this file only
covers what exists today and the structural rules the spec insists on.

The codebase is currently at the earliest stage of that spec's build order: a
`scraper` package with Section A (Access — "can an agent get the bytes?")
implemented as fetch probes plus a handful of Phase 2 check functions, run
from a CLI against one hardcoded URL, and a `web` package that is still an
unmodified `create-next-app` scaffold (plus one sample route proving routing
works). There is no crawler, no scoring engine, no database, and no
`criteria.yaml` yet — Section A's checks are hand-written functions, not
yet driven by a rulebook.

### Section A (done) — reference for building Section B

`scraper/src/section-a/` holds every Section A fetch probe and check
function, with `section-a/index.ts` as the section's single public entry
point: it exports `runSectionAAudit(url)`, which runs all of Section A's
probes and checks and returns one plain object. The root
`scraper/src/index.ts` never reaches into a section's internal files — it
only imports that one aggregating function per section and calls it.

When Section B is built, follow the same shape: a `scraper/src/section-b/`
folder, Phase 1 fetch probes and Phase 2 check functions as separate files
inside it, and a `section-b/index.ts` exporting one `runSectionBAudit(url)`
that the root `index.ts` calls alongside `runSectionAAudit`.

Section A's fetch probes (`section-a/ua-probe.ts`, `robots-audit.ts`,
`rate-limit-probe.ts`, `sitemap.ts`) and checks
(`payPerCrawlDetected`, `findPolicyDivergentAgents`,
`findBaselineMismatchedAgents`, all in `ua-probe.ts`) cover: per-agent
robots.txt allow/deny, a live UA probe per allowed agent, a `humanCrawler`
baseline fetch, 402/pay-per-crawl detection, policy-vs-reality divergence
(robots.txt says allow but the agent got challenged/blocked), baseline vs.
agent HTML mismatch, the gated rate-limit probe, and sitemap
presence/freshness. Not yet done, deliberately deferred: latency capture
per UA probe, and sitemap coverage-gap-vs-crawl (blocked on the crawler,
which doesn't exist yet).

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
| `pnpm scraper <url>` | Runs Section A's full audit (`runSectionAAudit`) against one URL |
| `pnpm --filter <pkg> <cmd>` | Run a command against a single package, e.g. `pnpm --filter web build` |

There is no test suite yet.

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
