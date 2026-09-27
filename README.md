# agent-readiness-auditor

A command-line tool that checks how well AI agents can use a website: what an
agent like ChatGPT-User, Claude-User or PerplexityBot actually gets back when
it asks for a page, and whether it can make sense of it.

You give it a URL. It picks up to 40 pages from the site's sitemap, fetches
each one twice (once as raw HTML, once in a real browser), runs 32 checks,
and writes a Markdown report listing what to fix first.

```
$ pnpm scraper https://linear.app

...

=== Scorecard ===

  Access        100
  Render        99
  Structure     88
  Semantics     0
  Documents     N/A   no linked documents found
  Provenance    —     observations, not scored

  Total         72    from 4 of 5 dimensions — documents N/A
```

## What it checks

The checks are grouped into six areas. Each one asks a single question.

**Access: can an agent get the page at all?** It reads robots.txt for 16 AI
agents and search bots, then requests the page as each one that robots.txt
allows. Plenty of sites allow a bot in robots.txt and then block it at the
firewall, and this is where that shows up. It also looks for pay-per-crawl
(HTTP 402) responses, rate limits, and a working sitemap.

**Render: is the content in the raw HTML?** Most agents read only the raw HTML,
so this compares the text in the raw HTML with the text after a
browser renders the page. It also flags soft 404s, cookie walls, content
hidden behind clicks or infinite scroll, text drawn in a canvas, and images
missing alt text.

**Structure: can the raw HTML be read and navigated?** How much of the page is
real content versus menus and boilerplate, and whether links are real links or
buttons that only work with JavaScript.

**Semantics: are the facts stated in a machine-readable way?** Whether the page
has JSON-LD structured data, whether it parses, and whether common types like
`Product` or `Organization` include the properties that matter.

**Documents: are important facts stuck inside PDFs?** It finds PDFs linked from
the sampled pages and checks whether they open, have a text layer, are tagged,
and are a reasonable size. The main check is for key documents like pricing,
terms and specs whose content exists only in the PDF.

**Provenance: has the site published anything for agents?** Right now that
means `/llms.txt`. It appears in the report as an observation, separate from
the score.

Every check has a weight, a severity and a suggested fix, and all of these
live in [`scraper/criteria.yaml`](scraper/criteria.yaml). The code decides
pass, warn or fail. The YAML file decides what each result is worth and what
the report says about it.

## Running it

You need Node.js 23.6 or newer (Node runs the TypeScript directly) and pnpm 11. Run `corepack enable` once to get the pinned pnpm version.

```bash
pnpm install
pnpm --filter scraper exec playwright install chromium   # the browser used for rendering
pnpm scraper https://example.com
```

A run on a big site takes a few minutes: pages are fetched one at a time with
a one-second pause between them. When it finishes, the report is saved to
`~/Downloads/<host>-<date>-<time>.md`.

Sites with a sitemap get the 40-page sample. For other sites it audits the URL
you typed, and the report says so.

### Be careful what you point it at

Part of the Access check tests the site's rate limit by sending about 45
requests over 12 seconds, ramping from 1 to 8 requests a second. It stops at
the first sign of a limit. That's gentle, but it's still traffic on someone
else's server, and it runs against any URL you give it, so keep repeated runs
to sites you own.

## Saving audits (optional)

Audits can be saved to a Supabase database so they can be looked at again
later. This part is optional: if the settings are missing, the run prints one
line about it and carries on.

1. Create a Supabase project and run
   [`supabase/migrations/0001_audits.sql`](supabase/migrations/0001_audits.sql)
   in its SQL editor.
2. `cp scraper/.env.example scraper/.env` and fill in `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. Use the secret key. The tables have row-level
   security switched on, so only the secret key can reach them.

Each run then prints `Audit <id> saved.` To rebuild an old audit's scorecard
and report straight from the database:

```bash
pnpm scraper --audit 3
```

This scores the saved findings against the current `criteria.yaml`, so
changing a weight and re-running old audits shows the effect straight away.
If the rulebook version has changed since the audit ran, the output says so.

## Other commands

| Command | What it does |
| --- | --- |
| `pnpm lint` | Type-checks the scraper |
| `pnpm --filter scraper test` | Runs the tests (Node's built-in test runner) |

## How it's put together

The one rule the code sticks to: fetching and judging are kept apart. All
network work happens first and produces plain data. Every check is then a
plain function over that data. That's why the tests run offline, and why a
saved audit can be scored again under a new rulebook.

```
scraper/
  criteria.yaml       weights, thresholds and report text for every check
  src/index.ts        the command: sample, capture, check, save, score, report
  src/section-a/ …    one folder per area of checks (a, b, c, d, f, g)
  src/scorecard.ts    turns findings into scores
  src/report.ts       writes the Markdown report
  src/audit-store.ts  every Supabase call
supabase/migrations/  the database tables
docs/                 how scoring works, step by step
specs/                one folder per feature: what was decided and why
```

Further reading:

- [`agent-readiness-auditor-spec.md`](agent-readiness-auditor-spec.md): the
  original product design
- [`docs/scoring-pipeline.md`](docs/scoring-pipeline.md): how a finding
  becomes a score
- [`GLOSSARY.md`](GLOSSARY.md): what words like *finding*, *template* and
  *gate* mean in this project
- `specs/`: the reasoning behind each feature

