# Scoring pipeline — from finding to report

What happens to a finding after a check produces it: how the rulebook turns
observations into scores, and how the report and the run-to-run diff are built
from the same stored rows.

None of this is implemented. Checks exist and emit findings; there is no
rulebook, no database, and no scorer. This document is the agreed shape of
build steps 2 and 3, written down while the reasoning was fresh so it does not
have to be rediscovered. Where the spec is silent, the section is marked
**Open** and states a recommendation rather than a decision.

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
warn  → earned = weight × 0.5  available = weight     (Open — see below)
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

Repeated per dimension, this produces the seven scores the spec asks for.
A total is still needed — for the gate step and for diffing — even though the
report does not lead with it. Say 61.

## Step 8 — gate

A gate ignores the arithmetic: if a specific condition holds, the total cannot
exceed a cap.

```
sitewide text coverage = (0.81 + 0.12 + 0.09) ÷ 3 = 0.34
gate: sitewide ratio < 0.15 → cap 40
0.34 is not below 0.15 → does not fire → score stays 61
```

Had the homepage also been 0.10, the average would be 0.10, the gate would
fire, and the score would be forced to 40 regardless of how strong the other
dimensions were.

Gates model reality: a site can score 85 on semantics while being unreadable
without JavaScript. An averaged score hides that; a gate refuses to. Record
which gate fired in `audit.gate_applied` so the report can explain the cap.

**Open — the sitewide gate needs a mechanism.** The spec's gate is on a
sitewide ratio, but `render.text_coverage` is page-scoped. Gates need a way to
express "aggregate these page findings, then test the aggregate" — a `when:`
clause in the rulebook, or a site-level criterion computed during scoring.
Decide before writing the rulebook, not after.

## Step 9 — group

Scoring ends here. The rest builds the report, and its audience is someone who
has to go fix things.

Organisation flips from **by page** to **by problem**: group the non-pass
findings by `criterion_key` and count the affected pages.

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
in a YAML file, not generated in TypeScript.

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
    scope: page                    # page | site
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

  - key: render.long_redirect_chain
    dimension: render
    scope: page
    weight: 2
    severity: low
    effort: S
    warn_only: true                # this check never returns pass or fail
    title: "Three or more redirect hops before the page"
    why: "Each hop costs latency and a chance for an agent to give up."
    fix: "Collapse the chain to a single hop"

gates:
  - criterion: robots.blocks_live_fetch
    cap: 20
    reason: "Live-fetch agents are blocked at the edge"
  - criterion: render.text_coverage
    when: { sitewide_ratio_below: 0.15 }
    cap: 40
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
render.homepage_redirect
render.long_redirect_chain
```

Section A does not participate yet. It returns bespoke shapes — `RobotsAudit`,
`PayPerCrawlFinding`, `BaselineMisMatch` — with no `criterionKey` anywhere in
`section-a/`. Section B is the first code written to the `Finding` contract.
Section A needs converting before scoring can cover both.

## Open decisions

Carried forward to build steps 2 and 3. None is settled by the spec.

**Warn credit.** Half credit is the recommendation, not a decision — the spec
(§4) defines dimension scores as "weighted pass/fail" and never mentions warn.
Three statuses were built deliberately: a page at ratio 0.45 is genuinely in a
different state from one at 0.05, and collapsing them discards that. The
credit belongs in the rulebook, not the scorer, for the same reason weights
do.

**Warn-only criteria.** `render.long_redirect_chain` never returns pass or
fail. If warn scored as fail, that criterion could only ever lose points,
which is wrong — so it needs either partial credit or a `warn_only` flag that
adjusts its ceiling. This case alone probably settles the warn question.

**Where thresholds live.** The checks own them today as named constants. If
the rulebook owns them, `runSectionBAudit` must take the rulebook as an
argument, changing the signature work item 04 designates a Test Seam. The
cleaner alternative — checks emit raw measurements and the scorer applies all
thresholds — means checks stop returning `status`, which is a much larger
rewrite. Not obvious; decide deliberately.

**One file or many.** ~50 criteria in one file is unwieldy.
`criteria/render.yaml`, `criteria/access.yaml`, merged at load, keeps diffs
readable.

**Key validation.** Nothing today catches a typo'd `criterionKey`; it is a
dangling foreign key no compiler sees. A load-time assertion that every
emitted key resolves to a rulebook entry, and every rulebook entry has a check
emitting it, is cheap and is the only thing preventing a silently unscored
finding.

## Source

Spec §4 (scoring model), §7.1 (rulebook), §8 steps 7–9 (score, close, render)
in `agent-readiness-auditor-spec.md`. Everything marked Open is not in the
spec.
