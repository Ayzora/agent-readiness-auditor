# Scoring pipeline — from finding to report

What happens to a finding after a check produces it: how the rulebook turns
observations into scores, and how the report and the run-to-run diff are built
from the same stored rows.

Steps 5–11 are built, in memory: `scoreFindings(findings, rulebook)` in
`scraper/src/scorecard.ts` is pure and synchronous, and `pnpm scraper` prints
its result as a **Scorecard** and a **Fix first** list after every section
block (Spec 0006). There is no database, so step 3's insert, step 4's read-back
and step 12's diff are not built — an in-memory array is stored rows for the
purposes of everything after the wall. This document was written as the agreed
shape before any of it existed; where a step says otherwise from what was
built, the step has been updated.

Vocabulary follows `GLOSSARY.md` — check, finding, evidence, rulebook,
dimension, gate. The governing rule is the spec's:

> YAML holds the questions. The database holds the answers.

## The wall

Everything divides at the moment a finding is written to the database.

**Before it** — crawling, probes, checks — is slow, networked and
unrepeatable. Someone else's server is involved and the request cannot be
taken back.

**After it** — scoring, gating, reporting, diffing — is pure arithmetic over
stored rows. Every step re-runs in milliseconds, for free, any number of
times.

This is the same separation as the Phase 1 / Phase 2 split inside `scraper`,
one level higher:

| | does the slow thing | reads the result of it |
| --- | --- | --- |
| Phase 1 → Phase 2 | fetch the page | check the page |
| Check → Score | check the page | score the findings |

Each layer lets the cheap half be redone without redoing the expensive half.
Change a weight, rewrite a `fix:` sentence, or revise the warn credit, and
every audit ever stored can be rescored without touching a single website.

## The worked example

Three pages, three render criteria. Referred to throughout.

| criterion | weight | effort |
| --- | --- | --- |
| `render.text_coverage` | 9 | L |
| `render.images_missing_alt` | 4 | S |
| `render.canvas_content` | 3 | M |

## Steps 1–3 — check, collect, insert

A check returns a finding. For `/pricing`:

```js
{ criterionKey: "render.text_coverage",
  url: "https://site.com/pricing",
  status: "fail",
  evidence: { ratio: 0.12, rawChars: 812, renderedChars: 6600 } }
```

`runSectionBAudit` collects it with the page's other findings, and it is
inserted **as is**, tagged with an `audit_id`. No score, no weight, no title.

Finding rows are immutable. They are written once and read forever. Scores are
never written back onto them — see step 6.

After the crawl, audit 42 holds nine rows:

| criterion_key | url | status | evidence |
| --- | --- | --- | --- |
| render.text_coverage | / | pass | ratio 0.81 |
| render.text_coverage | /pricing | fail | ratio 0.12 |
| render.text_coverage | /docs | fail | ratio 0.09 |
| render.images_missing_alt | / | pass | 0 of 12 missing |
| render.images_missing_alt | /pricing | pass | 0 of 4 missing |
| render.images_missing_alt | /docs | warn | 3 of 20 missing |
| render.canvas_content | / | pass | — |
| render.canvas_content | /pricing | pass | — |
| render.canvas_content | /docs | skip | render failed |

## Step 4 — read back

`SELECT * FROM finding WHERE audit_id = 42`.

The crawl is over. From here the input is stored rows and nothing else, which
is what makes every following step replayable.

## Step 5 — look up

The rulebook is parsed once at the start of the run into a dictionary, then
read-only:

```js
rulebook = {
  "render.text_coverage":      { dimension: "render", weight: 9, effort: "L", title, why, fix },
  "render.images_missing_alt": { dimension: "render", weight: 4, effort: "S", title, why, fix },
  "render.canvas_content":     { dimension: "render", weight: 3, effort: "M", title, why, fix },
}
```

For each row: `rulebook[row.criterion_key]`. A dictionary lookup on a string.

**This is where file and database join.** `finding.criterion_key` is a foreign
key pointing into a YAML file rather than another table — the rulebook is
identical for every site, so git versions it and the database does not.

The row says what happened. The rulebook says what it is worth and which
dimension it counts toward.

## Step 6 — score each finding

Each row becomes two numbers, **earned** and **available**:

```
pass  → earned = weight        available = weight
fail  → earned = 0             available = weight
warn  → earned = weight × warn_credit  available = weight   (0.5, in defaults)
skip  → earned = 0             available = 0
```

| url | criterion | status | weight | earned | available |
| --- | --- | --- | --- | --- | --- |
| / | text_coverage | pass | 9 | 9 | 9 |
| /pricing | text_coverage | fail | 9 | 0 | 9 |
| /docs | text_coverage | fail | 9 | 0 | 9 |
| / | images_alt | pass | 4 | 4 | 4 |
| /pricing | images_alt | pass | 4 | 4 | 4 |
| /docs | images_alt | warn | 4 | 2 | 4 |
| / | canvas | pass | 3 | 3 | 3 |
| /pricing | canvas | pass | 3 | 3 | 3 |
| /docs | canvas | skip | 3 | 0 | 0 |

`skip` contributes `0 of 0`. It cannot help or hurt. This line of arithmetic
is what "excluded from scoring entirely" means in the `Finding` comment — not
counted as a pass, which inflates, and not as a fail, which defames.

`status` is not computed here. The check set it at step 1 by comparing the
measurement against its thresholds.

**Nothing is written back.** `weight`, `earned` and `available` are not
columns and never will be; they are local variables in the scoring loop,
garbage-collected when it ends. Only the totals persist, to a different table:

| table | holds | mutable |
| --- | --- | --- |
| `finding` | what was observed | no — written once, read forever |
| `audit` | what was concluded | yes — recomputed whenever the rulebook changes |

Writing scores onto finding rows would mean rewriting history on every weight
change, and would lose the original observation. Immutable findings are what
make steps 4–12 replayable.

## Step 7 — aggregate

Sum both columns, grouped by the `dimension` field from the rulebook:

```
render:  earned    = 9 + 0 + 0 + 4 + 4 + 2 + 3 + 3 + 0  = 25
         available = 9 + 9 + 9 + 4 + 4 + 4 + 3 + 3 + 0  = 45
         score     = 25 ÷ 45 × 100 = 56
```

Scoring is **points earned over points available**, not a running total that
passes add to and failures subtract from.

Repeated per dimension, this produces a score for each scored dimension. A
total is still needed — for the gate step and for diffing — even though the
report does not lead with it: the dimension scores are always printed above it.

**Decided — the total is the unweighted mean of the dimension scores**, not
earned and available pooled across every finding. Pooled, page-scope
dimensions swamp site-scope ones as the crawl grows — at 40 pages access would
be about 2% of the total. Averaged, each dimension counts once however many
findings it holds. The mean is taken over unrounded scores, then rounded. An
N/A dimension is left out and named beside the total; an observational one is
neither counted nor named. Say 61.

**Decided — no total without access.** When access is N/A no total is
computed and the scorecard says why: the gates are access criteria, so a total
without access is a total whose gates could not be checked. Since Spec 0007
Section A never throws and `robots_allows_agents` always returns a verdict, so
this path has no trigger in a normal run and stays as a guard.

## Step 8 — gate

A gate ignores the arithmetic: if a specific condition holds, the total cannot
exceed a cap.

**Decided — a gate fires when its criterion has at least one finding and every
one of them fails.** That keeps a gate to `{ criterion, cap, reason }`, and it
is exact for site-scope criteria, which have one finding. Two are built:

```
access.robots_allows_agents  fails → cap 20   robots.txt blocks every AI agent
access.policy_divergence     fails → cap 25   the server blocks every AI agent robots.txt allows
```

`policy_divergence` fails only when **every** probed agent was blocked and
warns when some were, so one minor crawler cannot cap a whole site. When
several gates fire the lowest cap applies; every fired gate is listed, and the
uncapped total is kept beside the capped one. A gate caps the total only and
never changes a dimension score.

Gates model reality: a site can score 85 on semantics while being unreadable
to every agent. An averaged score hides that; a gate refuses to.

**Deferred — the sitewide text-coverage gate** (`sitewide ratio < 0.15 → cap
40`). It needs an average of an evidence value across pages with its own
cutoff, machinery the other gates do not, and "sitewide" means nothing on one
page. It waits for its own Spec, which can now read the sitemap sample. A
JavaScript-only site is already penalised across render, structure and
semantics, because Sections C and D read raw HTML only.

## Step 9 — group

Scoring ends here. The rest builds the report, and its audience is someone who
has to go fix things.

Organisation flips from **by page** to **by problem**: group the findings that
cost points — a `fail`, or a `warn` — by `criterion_key` and count the affected
subjects. Skips, passes and unscored criteria never appear.

```
render.text_coverage       → 2 pages failing: /pricing, /docs
render.images_missing_alt  → 1 page warning:  /docs
```

"Fix your JS rendering" is one engineering task that clears both pages.
Listing it per page implies two jobs, and on a real site, seventeen.

## Step 10 — sort by ROI

Severity alone is the wrong order: a critical issue on one page that takes
three weeks beats nothing, but a high issue on forty pages that takes an hour
beats it.

```
ROI = weight × affected_pages ÷ effort        (S=1, M=3, L=6)

text_coverage:  9 × 2 ÷ 6 = 3.0
images_alt:     4 × 1 ÷ 1 = 4.0   ← first
```

The alt-text issue wins here — smaller, but nearly free. On a site where text
coverage hit 17 pages, `9 × 17 ÷ 6 = 25.5` would dominate.

Ties go to the higher weight, then to the key alphabetically, so the order is
identical across runs.

This is what turns the report from a list of complaints into an ordered work
queue.

## Step 11 — render

Every report entry is assembled from two sources:

- **The rulebook** supplies the words — `title`, `why`, `fix`. Identical for
  every site ever audited.
- **The findings' evidence** supplies the numbers — different every site,
  every run.

```
## Content requires JavaScript to appear          ← rulebook: title

Many agents fetch raw HTML without executing JS.  ← rulebook: why
If most of your text only appears after render,
they see an empty page.

Fix: Server-render primary content, or provide    ← rulebook: fix
     a static fallback.

Affected: 2 pages                                 ← evidence
  /pricing — 812 chars without JS, 6,600 with (12%)
  /docs    — 540 chars without JS, 6,000 with (9%)
```

This is the payoff for carrying evidence on every finding. Without it a report
can only say "fail", which is neither believable nor verifiable. With it the
report quotes the site's own numbers back at it.

It is also why `Finding` has no `title` field: that sentence is written once,
in a YAML file, not generated in TypeScript. The scorecard carries keys and
numbers only, for the same reason, and the printer reads the words.

**As built, the terminal's Fix first list prints no evidence** — the section
blocks above it already print every finding's evidence. The Markdown report
(`scraper/src/report.ts`, Spec 0009) quotes it per entry, in full, as
`name: value` pairs under each affected subject.

## Step 12 — diff

Match rows from two audits on **`criterion_key` + `url`** — the pair
identifying the same question about the same page across time.

| criterion + url | audit 42 | audit 58 | verdict |
| --- | --- | --- | --- |
| text_coverage + /pricing | fail | pass | resolved |
| text_coverage + /docs | fail | fail | still failing |
| images_alt + /docs | warn | warn | still warning |
| canvas + / | pass | fail | regressed |
| text_coverage + /careers | — | fail | new |

> Score 61 → 74. 1 resolved, 1 regressed, 1 new.

A one-off score is a curiosity; "you fixed 14 things and broke 3" is a reason
to keep paying. It works only because step 3 stored the raw observation rather
than a computed number — the diff compares findings, not scores.

`audit.ruleset_version` pins each run to the rulebook as it stood that day, so
a weight change in November does not retroactively invalidate an August score.

## Rulebook shape

```yaml
version: v0.1.0
defaults:
  warn_credit: 0.5

criteria:
  - key: render.text_coverage      # matches finding.criterionKey exactly
    dimension: render              # which of the seven scores it feeds
    scope: page                    # page | site | document
    weight: 9
    severity: critical
    effort: L                      # S/M/L — the ÷ effort in the ROI sort
    thresholds:
      warn: 0.6
      fail: 0.3
    title: "Content requires JavaScript to appear"
    why: >
      Many agents fetch raw HTML without executing JS. If most of your
      text only appears after render, they see an empty page.
    fix: "Server-render primary content, or provide a static fallback"

gates:
  - criterion: access.robots_allows_agents   # fires when every finding fails
    cap: 20
    reason: "robots.txt blocks every AI agent"
```

Changing a weight is: edit file → bump `version` → commit → tag. Git is the
versioning system, which is why there is no `criterion` table.

Note the spec's §7.1 sketch carries a single `threshold: 0.6`. The checks emit
three statuses and therefore need two thresholds. The code is right; the
spec's sketch is under-specified.

## Criterion keys emitted today

Section B, all page-scoped. These seed the rulebook.

```
render.text_coverage           render.hidden_but_present
render.empty_rendered_page     render.images_missing_alt
render.js_redirect             render.canvas_content
render.halves_diverged         render.iframe_primary_content
render.homepage_redirect       render.content_behind_interaction
render.long_redirect_chain     render.infinite_scroll
render.soft_404                render.consent_wall
```

Fourteen keys, of which ten are emitted for every page. The four redirect
checks — `js_redirect`, `halves_diverged`, `homepage_redirect`,
`long_redirect_chain` — stay silent unless their shape fires, so a page with
no redirect trouble contributes none of them. A criterion with no finding for
a page is absent from scoring for that page, exactly as a `skip` is.

Section A, emitted once per run:

```
access.robots_allows_agents    access.rate_limit
access.policy_divergence       access.sitemap_present
access.pay_per_crawl           access.sitemap_freshness
access.baseline_mismatch
```

Section F, **document-scoped** — emitted once per linked PDF, not per page:

```
documents.reachable            documents.tagged_structure
documents.html_equivalent      documents.size
documents.text_layer
```

A document finding's `url` is the file's own, so step 9 counts documents
affected and step 12 diffs the same file across runs. A document never opened
contributes no findings at all rather than four skips, and
`documents.html_equivalent` is emitted only for key documents.

Section G, **site-scoped** and emitted once per run:

```
provenance.llms_txt
```

One key, and the first **unscored** one — see below.

## Unscored criteria

A criterion marked `scored: false` in the rulebook is measured and reported and
contributes to neither side of the arithmetic:

```
earned    += 0
available += 0
```

Not counted as a pass, which inflates the score, and not as a fail, which
defames the site — the same exclusion a `skip` gets at step 6, for a different
reason. A `skip` is excluded because the check could not run. An unscored
criterion is excluded because what it asks about is not adopted widely enough
to charge a site for.

`loadRulebook()` enforces the flag's other half: every criterion **not** marked
`scored: false` must carry a weight greater than zero, or the load throws and
names the key. A zero weight would have been indistinguishable from a forgotten
field, and a forgotten field would drop a criterion out of the arithmetic in
silence.

`provenance.llms_txt` is the only one today. Because it is provenance's only
criterion, that dimension sums `0 earned ÷ 0 available` in every run — N/A by
construction rather than by circumstance, and rendered as
*"Section G — provenance (observations, not scored)"* rather than as a number.

## Dimensions that do not apply

A site linking no PDFs produces no Section F findings, so the documents
dimension sums `0 earned ÷ 0 available` — which is not a score, and must not be
rendered as one.

```
documents: earned = 0, available = 0  →  N/A, not 0
```

The report says *"Documents — not applicable: no linked documents found"*, and
the total is computed across the dimensions that produced a score and names the
ones it left out. Access is the exception: with access N/A the total is
withheld (step 7). Scoring it 0
would mark a restaurant down for not publishing a price list PDF; awarding a
pass for the absence would score a restaurant and a law firm identically. This
generalises: any dimension whose criteria are all absent, skipped or unscored
is N/A. `documents` is simply the first one where it happens routinely;
`provenance` is the first where it happens by design.

## Decisions and open questions

Most of what was open here was settled by Spec 0006 (`specs/0006-scorecard/`)
when steps 5–11 were built; each entry says which it is.

**Warn credit — decided.** Half credit, held in `criteria.yaml` as
`defaults.warn_credit: 0.5` and validated by `loadRulebook()` to lie between 0
and 1. Counting a warn as a fail discards the distinction three statuses were
built for; counting it as a pass lets the report flag problems the score
ignores. 0.5 is a working assumption, not a measurement.

**Warn-only criteria — decided, no flag.** `render.long_redirect_chain` emits
only when there is a problem, so it costs half its weight when present and
nothing when absent, which is right because absence means no problem. No
`warn_only` flag is needed.

**A check that can never fail — unscored.** `render.hidden_but_present` can only
pass or warn, because a reading agent reads hidden text fine; half credit would
still charge the site for it, so it is `scored: false`.

**The total — decided.** It exists, is the unweighted mean of dimension scores,
never leads the report, and is withheld when access is N/A (step 7). Whether
access should count for more than other dimensions is unexamined; per-dimension
weights can be added to the rulebook later.

**Gates — decided.** Every-finding-fails, no new syntax, the sitewide gate
deferred (step 8).

**Where thresholds live — decided.** In `criteria.yaml`, read by the checks.
Every section aggregator takes the rulebook as an argument and each check
destructures its own numbers with `thresholdsFor`, so checks still return
`status`. The alternative — checks emit raw measurements and the scorer applies
all thresholds — was rejected for now: it rewrites every check, and several
(infinite scroll, the redirect shapes) have no single number to compare. The
cost accepted: a stored finding keeps the verdict its thresholds gave on the
day, so changing a threshold needs a re-run, not just a rescore.

**One file or many — open.** ~50 criteria in one file is unwieldy.
`criteria/render.yaml`, `criteria/access.yaml`, merged at load, keeps diffs
readable.

**Key validation — open.** The scorer throws, naming the key, on a finding whose
`criterionKey` the rulebook does not define — so a typo fails the run rather
than dropping out of the score. Nothing checks it at load time, and nothing
catches a rulebook entry no check emits. A load-time assertion in both
directions is still cheap.

## Source

Spec §4 (scoring model), §7.1 (rulebook), §8 steps 7–9 (score, close, render)
in `agent-readiness-auditor-spec.md`. Everything marked Open is not in the
spec.
