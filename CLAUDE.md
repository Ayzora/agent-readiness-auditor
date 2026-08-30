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
`scraper` package with two standalone site-level probes (robots.txt audit,
rate-limit probe) run from a CLI, and a `web` package that is still an
unmodified `create-next-app` scaffold (plus one sample route proving routing
works). There is no crawler, no checks/scoring engine, no database, and no
`criteria.yaml` yet.

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
| `pnpm scraper <url>...` | Runs the scraper's robots-audit (and optionally rate-limit probe) against one or more URLs |
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
`import { robotsAudit } from "./robots-audit.ts"`), enabled by
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
`robots-audit.ts` and `rate-limit-probe.ts` are Phase-1-only site-level
probes for this reason.

### Planned data model (not yet implemented)

From the spec, worth knowing before adding persistence:

> YAML holds the questions. The database holds the answers.

Scoring rules, weights, and remediation text live in a versioned
`criteria.yaml` (git-tracked, identical across every audited site). Per-run
results (`site` → `audit` → `finding`, plus `task_run` in Phase 2) live in the
database and are never versioned — they're an event log. `finding.criterion_key`
is a foreign key into the YAML file, not a DB table.

### Rate-limit probe safety constraints

`scraper/src/rate-limit-probe.ts` intentionally puts load on someone else's
infrastructure — treat any change to it as a safety-sensitive change, not
just a perf one:

- Hard cap at ~10 req/s, ramped gently (1 → 2 → 4 → 8 req/s).
- Aborts on first 429 or any `Retry-After` header.
- Hits one cheap static asset repeatedly, never dynamic pages.
- Per the spec, this check should stay opt-in and gated on verified domain
  ownership once that exists — it isn't gated yet.
