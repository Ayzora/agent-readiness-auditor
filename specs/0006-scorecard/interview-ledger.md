---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: Does this build include persistence, or is it arithmetic over an in-memory findings array printed to the terminal?

Recommended Answer:
- In-memory only, no database.
- `scoreFindings(findings, rulebook)` takes the array `index.ts` already holds and returns a plain result object.
- Implements `docs/scoring-pipeline.md` steps 5–11: look up, score each finding, aggregate per dimension, gate, group by criterion, sort by ROI, render.
- Excludes step 4 (read back) and step 12 (diff), the only two that need stored rows.
- Printed by a new function in `print-report.ts`, after the section blocks.

Answer: Happy with the in-memory recommendation.

Decision: The scorer is a pure function over the in-memory findings array. No database, no disk and no network in this build.

Reason: Persistence buys re-scoring without re-crawling and the run-to-run diff, and neither is reachable until a second run exists. The diff compares findings rather than scores, so building the scorer first costs it nothing.

Negative Requirements:
- The scorer performs no I/O of any kind — not network, not disk.
- No database, schema or migration in this build.

### L2

Status: current

Question: What do we call the thing the scorer produces?

Recommended Answer:
- **Scorecard** — the result of scoring one run's findings against the rulebook: a score per dimension, the total, the gate that capped it if any, and the non-pass findings grouped by criterion and sorted by ROI.
- The function is `scoreFindings(findings, rulebook): Scorecard`.
- **Audit** stays the whole run; **report** stays the printed text a person reads.

Answer: Scorecard is fine.

Decision: The scorer's result is a **Scorecard**. `GLOSSARY.md` was updated during the interview.

Reason: "Audit" already names the whole run, and the scoring doc also used it for the stored totals. One word for two things would have ended up as a type name, a function name, a glossary entry and later a table.

Constraints:
- Do not call the result an audit, a report, a result or a verdict.

### L3

Status: current

Question: Does the scorecard have a total score, and if it does, how is it worked out?

Recommended Answer:
- Yes: a total, averaged over dimensions.
- `total` is the mean of the dimension scores that produced a number, rounded to a whole number.
- N/A dimensions are left out of the average, not counted as 0.
- Gates cap `total`; `total` is what comparing runs will use.
- The report shows the dimension scores first and the total below them.
- Every dimension counts equally for now.

Answer: Both is great — every dimension score and a total — and go with the averaged total.

Decision: The scorecard carries every dimension score and a total. The total is the unweighted mean of the dimension scores that produced a number.

Reason: A pooled total lets page-scope dimensions swamp site-scope ones once the crawler exists: at 40 pages render produces about 400 findings while access still produces about 7, so pooled, access becomes about 2% of the total and a site blocking every agent could still score well. The averaged total keeps each dimension's influence fixed regardless of page count. The total never appears alone, because a single number does not tell a site owner where they did well.

Examples:
- render 56, access 75, structure 80 → total (56 + 75 + 80) ÷ 3 = 70.

Answer History:
- The user first read "total" as the per-dimension earned ÷ available; the distinction between the dimension score (level 1) and the total (level 2) was clarified before the answer.

### L4

Status: current

Question: How do gates work, and which of the three gates from §4 of the product spec does this build include?

Recommended Answer:
- A gate fires when every finding for its criterion is `fail`. For a site-scope criterion that is one finding. The `Gate` type stays `{ criterion, cap, reason }`.
- Gate 1 — robots.txt blocks every AI agent, `access.robots_allows_agents`, cap 20 — ships as it is.
- Gate 2 — live-fetch agents blocked at the edge, `access.policy_divergence`, cap 25 — ships, with a check change: `policy_divergence` becomes `warn` when some probed agents are blocked and `fail` when all are, the shape `robots_allows_agents` already has.
- Gate 3 — sitewide text coverage below 0.15, cap 40 — waits for the crawler.
- When more than one gate fires, the lowest cap wins, and the scorecard lists every gate that fired.

Answer: Happy with that recommendation.

Decision: Gates 1 and 2 ship under the rule "fires when every finding for the criterion is `fail`". `access.policy_divergence` changes to warn-on-some, fail-on-all. Gate 3 is deferred.

Reason: `robots_allows_agents` already fails only when every agent is blocked. `policy_divergence` fails today when any one agent is blocked, so gating on it as written would cap a whole site at 25 because one minor crawler was turned away. Gate 3 needs an average of an evidence value across pages with its own cutoff, which the `Gate` type cannot express, and "sitewide" means nothing while the audit visits one page. A JavaScript-only site is already dragged down without it, because Sections C and D read raw HTML only.

Constraints:
- No new gate syntax in the rulebook in this build.
- A gate's cap applies to the total only; it does not change any dimension score.

### L5

Status: current

Question: How many points does a `warn` earn?

Recommended Answer:
- Half the points: `earned = weight × 0.5`, `available = weight`.
- The 0.5 lives in the rulebook as `defaults.warn_credit: 0.5` at the top of `criteria.yaml`.
- `loadRulebook()` checks it is a number from 0 to 1 and throws otherwise.
- One value for every criterion; no per-criterion override in this build.

Answer: It was already the unwritten rule of × 0.5.

Decision: A warn earns half its criterion's weight, set by `defaults.warn_credit: 0.5` in `criteria.yaml` and validated at load.

Reason: Counting a warn as a fail treats a page at 45% text coverage the same as one at 5%, discarding the reason three statuses were built. Counting it as a pass lets the report flag problems the score ignores. The credit is a judgement call, so it belongs in the rulebook, as thresholds do.

### L6

Status: deferred

Question: What happens when a finding's criterion key is not in the rulebook?

Recommended Answer:
- The scorer throws before any arithmetic, naming the key.
- Checked in one direction only: every finding's key must resolve. The reverse cannot be checked per run, because some criteria are legitimately absent.

Answer: This question is irrelevant — skip.

Decision: Not decided. No unknown-key guard is specified for this build; behaviour on a missing key is left to implementation.

Reason: The user judged the risk not worth a requirement. At the time of the interview all 32 keys typed in the check code matched the 32 keys in `criteria.yaml`.

### L7

Status: current

Question: Should `render.hidden_but_present` count toward the score at all?

Recommended Answer:
- Mark it `scored: false` and remove `weight: 2`.
- It is still measured and still appears in the report with its evidence.
- Revisit in Phase 2, when the agent drives a browser.

Answer: Your recommendation is fine, yes.

Decision: `render.hidden_but_present` becomes an unscored criterion.

Reason: Spec 0001 Requirement 34 decided the check can never fail because "an agent parsing HTML reads that content fine, and failing a site for it would be dishonest". Under half warn credit it would still cost 1 point of 2 for something that does not hurt the agents this tool measures. The unscored flag exists for exactly this case.

### L8

Status: current

Question: What does the printed scorecard look like?

Recommended Answer:
- Two blocks, printed after all section blocks: `=== Scorecard ===` then `=== Fix first ===`.
- Dimensions in spec order; action (Section E) omitted entirely.
- N/A says why: "no linked documents found" for documents, "no scored findings" for any other dimension. Provenance reads "observations, not scored".
- When a gate fires, the total shows both numbers: "20, capped from 70", with a `Gate` line naming it.
- Fix first lists every fail and warn that costs points, grouped by criterion, sorted by ROI = weight × affected ÷ effort (S=1, M=3, L=6). Ties go to the higher weight, then alphabetical key.
- Each entry: title, why and fix from the rulebook, dimension, severity, effort, and the affected subjects.
- No evidence in the Fix first block.

Answer: Happy with this recommendation.

Decision: The scorecard prints as a Scorecard block and a Fix first block in the agreed format, after every section block.

Reason: The scorecard is the conclusion of the run, so it prints last. Showing the uncapped total tells a site owner what fixing the gate would recover. Evidence is already printed per finding in the section blocks, and formatting it well is different for every criterion.

Examples:

```
=== Scorecard ===

  Access        75
  Render        56
  Structure     80
  Semantics     90
  Documents     N/A   no linked documents found
  Provenance    —     observations, not scored

  Total         20    capped from 70
  Gate          robots.txt blocks every AI agent → cap 20

=== Fix first ===

  1. Content requires JavaScript to appear          render · critical · effort L
     Many agents fetch raw HTML without executing JavaScript...
     Fix: Server-render primary content, or provide a static fallback
     Affected: https://site.com/
```

Negative Requirements:
- Skips, passes and unscored criteria never appear in Fix first.
- No evidence values in Fix first in this build.

### L9

Status: current

Question: What does the scorecard say when dimensions are N/A for the wrong reason — the whole site unreachable, or Section A crashing while the page loaded?

Recommended Answer:
- Unreachable means no response at all: DNS failure, connection refused, or both the raw fetch and the browser timing out. A 403 or 500 is a response and is not unreachable.
- An unreachable site stops the run: one line, `Could not reach <url> — <error>. No audit produced.`, a non-zero exit code, no sections and no scorecard.
- When access has no score, the dimension scores still print but no total is computed: `Total — not computed: access could not be measured, so gates could not be checked`.
- When any other dimension except provenance is N/A, the total line names what it left out: `Total 72 — from 4 of 5 dimensions, documents N/A`.

Answer: The user proposed stopping the audit both when the site is unreachable and when crucial elements of Section A crash; accepted the adjusted recommendation above ("ok thats fine").

Decision: An unreachable site stops the run. Access with no score withholds the total rather than stopping the run. Any other excluded dimension is named on the total line.

Reason: An all-N/A scorecard is sixteen skip lines that say nothing. Stopping on a Section A crash was rejected because the crash is this tool's fragility, not the site's problem, and throwing away five dimensions of valid findings would punish the user for it. Section A is also all-or-nothing today: one `try` wraps the whole section, so the rate-limit probe — the least important and most fragile — would be able to kill the run. Withholding the total keeps the findings and never shows a number that is missing access or its gates.

Answer History:
- Initial recommendation: never stop; the total line always names what it left out, with total N/A when nothing scored.
- User proposal: stop on an unreachable site, and stop when crucial Section A elements crash.
- Final: stop on an unreachable site; withhold the total, not stop, when access has no score.

Negative Requirements:
- A 403 or 500 response must not stop the run.
- A Section A crash must not stop the run.
- A total must never be printed when access has no score.

Constraints:
- Once the crawler exists, only the starting URL being unreachable stops the run; one dead page among many must not.

### L10

Status: current

Question: Do the scorer's tests use the real `criteria.yaml` or a small made-up rulebook?

Recommended Answer:
- Arithmetic tests build a tiny rulebook by hand inside the test — two or three criteria with round weights like 10 and 5 — so expected values are checkable at a glance and retuning real weights never breaks them.
- Two new helpers in `utils.ts` beside `snapshotFrom`: `findingFrom(overrides)` and `rulebookFrom(criteria)`.
- One test loads the real `criteria.yaml`, scores a realistic findings array and asserts only the shape of the result — every dimension present, the total within 0–100, provenance never averaged in — never exact numbers.
- Fake rulebooks exist only inside tests; the real audit always loads `criteria.yaml`.

Answer: Happy with the recommendation.

Decision: Scorer arithmetic is tested against hand-built rulebooks; one shape-only test runs against the real rulebook.

Reason: The rule that tests load the real `criteria.yaml` protects threshold names, which checks read by name and whose fixtures sit inside a band. The scorer reads weight values, and pinning those in assertions would make every weight change look like a bug.
