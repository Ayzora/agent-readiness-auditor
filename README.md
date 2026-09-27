# agent-readiness-auditor

A command-line tool that checks how well AI agents can use a website. It
doesn't measure what a person sees in a browser. It measures what an agent
like ChatGPT-User, Claude-User or PerplexityBot actually gets back when it asks
for a page, and whether it can make sense of what it gets.

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

## Status

I've stopped working on this. The command-line tool is complete and works end
to end, but the web interface and a few other planned features were never
built. See [What isn't built](#what-isnt-built).

## What it checks

The checks are grouped into six areas. Each one asks a single question.

**Access: can an agent get the page at all?** It reads robots.txt for 16 AI
agents and search bots, then requests the page as each one that robots.txt
allows. Plenty of sites allow a bot in robots.txt and then block it at the
firewall, and this is where that shows up. It also looks for pay-per-crawl (HTTP 402) responses,
rate limits, and a working sitemap.

**Render: is the content there without JavaScript?** Most agents don't run
JavaScript. This compares the text in the raw HTML with the text after a
browser renders the page. It also flags soft 404s, cookie walls, content
hidden behind clicks or infinite scroll, text drawn in a canvas, and images
with no alt text.

**Structure: can the raw HTML be read and navigated?** How much of the page is
real content versus menus and boilerplate, and whether links are real links or
buttons that only work with JavaScript.

**Semantics: are the facts stated in a machine-readable way?** Whether the page
has JSON-LD structured data, whether it parses, and whether common types like
`Product` or `Organization` include the properties that matter.

**Documents: are important facts stuck inside PDFs?** It finds PDFs linked from
the sampled pages and checks whether they open, have a text layer, are tagged,
and aren't too big. The main check is for key documents like pricing, terms
and specs whose content isn't also on an HTML page.

**Provenance: has the site published anything for agents?** Right now that
means `/llms.txt`. It's reported but doesn't count toward the score, because
not enough agents read it yet.

Every check has a weight, a severity and a suggested fix, and all of these
live in [`scraper/criteria.yaml`](scraper/criteria.yaml). The code decides
pass, warn or fail. The YAML file decides what each result is worth and what
the report says about it.

## Running it

You need Node.js 23.6 or newer (the TypeScript runs directly, with no build
step) and pnpm 11. Run `corepack enable` once to get the pinned pnpm version.

```bash
pnpm install
pnpm --filter scraper exec playwright install chromium   # the browser used for rendering
pnpm scraper https://example.com
```

A run on a big site takes a few minutes: pages are fetched one at a time with
a one-second pause between them. When it finishes, the report is saved to
`~/Downloads/<host>-<date>-<time>.md`.

If the site has no normal sitemap, only the URL you typed is audited, and the
report says so.

### Be careful what you point it at

Part of the Access check tests the site's rate limit by sending about 45
requests over 12 seconds, ramping from 1 to 8 requests a second. It stops at
the first sign of a limit. That's gentle, but it's still traffic on someone
else's server, and the tool doesn't ask whether the site is yours. Don't run
it in a loop against sites you don't own.

## Saving audits (optional)

Audits can be saved to a Supabase database so they can be looked at again
later. Without this set up, everything else still works: the run prints one
line saying the audit wasn't saved and carries on.

1. Create a Supabase project and run
   [`supabase/migrations/0001_audits.sql`](supabase/migrations/0001_audits.sql)
   in its SQL editor.
2. `cp scraper/.env.example scraper/.env` and fill in `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. Use the secret key, not the publishable one. The
   tables have row-level security switched on with no policies, so the
   publishable key can't read or write anything.

Each run then prints `Audit <id> saved.` To rebuild an old audit's scorecard
and report without touching the website:

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
plain function over that data, with no network access. That's why the tests
need no network and no browser, and why a saved audit can be scored again
under a new rulebook.

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
- `specs/`: the reasoning behind each feature, including things that were
  deliberately left out

## What isn't built

- **A web interface.** It was planned but never started. The tool is
  command-line only.
- **Comparing two audits.** Saved audits make this possible ("you fixed 14
  things and broke 3"), but it was never written.
- **Section E, Action.** Checks for whether an agent can complete a purchase,
  booking or contact form. Deferred.
- **Agent task runs.** Having real AI agents try tasks on the site was planned
  as a second phase.
- **A few smaller checks** described in the specs: a sitewide render gate, a
  sitemap coverage gap, and whether a page's structured-data type matches what
  the page actually is.
- **Tests for Section B.** Every other section has them.
