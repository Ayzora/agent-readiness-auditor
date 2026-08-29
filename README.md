# agent-readiness-auditor

A pnpm workspace containing a Crawlee-based scraper and a Next.js web front end.

> The one-line description above is a placeholder — replace it with what the
> auditor actually measures once that's settled.

## Prerequisites

- Node.js 23.6 or newer. The scraper is TypeScript that Node runs directly by
  stripping the type annotations, which earlier versions either reject or need a
  flag for.
- pnpm 11 (pinned via the `packageManager` field; run `corepack enable` to have
  the right version selected automatically)

## Setup

```bash
pnpm install
cp web/.env.example web/.env
cp scraper/.env.example scraper/.env
```

Each package keeps its own env file, because Next.js only reads `web/.env` and
will not look further up the tree. Keep the `.env.example` beside it updated in
the same commit whenever you add a variable — nothing enforces that.

Node does not load `scraper/.env` on its own. When the scraper needs a real
variable, change its `start` script to
`node --env-file-if-exists=.env src/index.ts`.

## Commands

Run these from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the Next.js dev server on http://localhost:3000 |
| `pnpm build` | Builds every workspace package |
| `pnpm lint` | Lints every workspace package — ESLint in `web`, `tsc --noEmit` in `scraper` |
| `pnpm scraper` | Runs the scraper once |

To run a command against a single package directly, use a filter — for example
`pnpm --filter web build`.

## Layout

```
.
├── web/       Next.js 16 (App Router), React 19, Tailwind 4
└── scraper/   ESM TypeScript entrypoint built on Crawlee, run without a build
```

Both are private packages and share the single root `pnpm-lock.yaml`. When the
two need to share types, add a third workspace package rather than importing
across directories with relative paths.
