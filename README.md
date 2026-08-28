# agent-readiness-auditor

A pnpm workspace containing a Crawlee-based scraper and a Next.js web front end.

> The one-line description above is a placeholder — replace it with what the
> auditor actually measures once that's settled.

## Prerequisites

- Node.js 20 or newer
- pnpm 11 (pinned via the `packageManager` field; run `corepack enable` to have
  the right version selected automatically)

## Setup

```bash
pnpm install
cp .env.example .env
```

## Commands

Run these from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the Next.js dev server on http://localhost:3000 |
| `pnpm build` | Builds every workspace package |
| `pnpm lint` | Lints every workspace package |
| `pnpm scraper` | Runs the scraper once |

To run a command against a single package directly, use a filter — for example
`pnpm --filter web build`.

## Layout

```
.
├── web/       Next.js 16 (App Router), React 19, Tailwind 4
└── scraper/   Plain ESM Node entrypoint built on Crawlee
```

Both are private packages and share the single root `pnpm-lock.yaml`. When the
two need to share types, add a third workspace package rather than importing
across directories with relative paths.
