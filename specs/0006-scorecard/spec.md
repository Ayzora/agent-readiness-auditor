---
type: Spec
title: "The scorecard: scoring one run's findings against the rulebook"
---

## Problem

Six sections now emit findings against 32 criteria, and nothing turns them into a conclusion. `pnpm scraper <url>` prints every finding and exits. A site owner reading it gets pages of pass, warn, fail and skip lines, no score, no sense of which dimension is weak, and no order to fix things in.

`docs/scoring-pipeline.md` already specifies how findings become scores — twelve steps from read-back to diff — but it was written before anything was built and leaves four questions open: what a `warn` is worth, how the sitewide gate works, whether there is a total, and what happens to criteria that can only warn. §4 of the product spec adds a contradiction of its own: it says "do not emit a single 0–100", then defines gates that cap "the total".

The rulebook is also not yet ready to be scored against. It has one gate where §4 names three, `defaults.warn_credit` appears in the scoring doc's sketch but not in `criteria.yaml`, one of the two access gates would fire on the wrong condition, and `render.hidden_but_present` carries a weight that contradicts the reason spec 0001 gave for it never failing.

## Proposed Outcome

A pure, synchronous `scoreFindings(findings, rulebook): Scorecard` in `scraper/src/scorecard.ts` that implements steps 5–11 of `docs/scoring-pipeline.md` over the findings array the run already holds, with no persistence. [L1] [L2]

`pnpm scraper <url>` prints two new blocks after every section block — a **Scorecard** with a score per dimension, a total and any gate that capped it, and a **Fix first** list of every problem that costs points, ordered by return on effort. [L3] [L8]

The rulebook gains `defaults.warn_credit: 0.5` and a second gate, `access.policy_divergence` changes to warn on some blocked agents and fail on all, and `render.hidden_but_present` becomes unscored. [L4] [L5] [L7]

An unreachable site stops the run with one line instead of a page of skips, and a run where access could not be measured prints no total rather than a misleading one. [L9]

## User Stories

1. As a site owner, I want a score for each dimension, so I can see where my site is strong and where it is weak. [L3]
2. As a site owner, I want a total as well, so I can track progress between runs — but never shown without the dimension scores beside it. [L3]
3. As a site owner whose robots.txt or server blocks every AI agent, I want the total capped and the reason stated, so strong scores elsewhere cannot hide that no agent can read my site. [L4]
4. As a site owner whose server blocks one minor crawler, I do not want my whole site capped for it. [L4]
5. As a site owner, I want a warning to cost me less than a failure, because it describes a real but lesser problem. [L5]
6. As a site owner, I do not want to lose points for things that do not hurt the agents this tool measures. [L7]
7. As a site owner, I want the problems listed in the order worth fixing them, so the report is a work queue rather than a list of complaints. [L8]
8. As a site owner whose site links no PDFs, I want the documents dimension shown as not applicable, never as 0. [L8]
9. As a user whose URL cannot be reached at all, I want to be told so in one line, not shown sixteen lines of skips. [L9]
10. As a site owner, I never want to be shown a total that silently left out access. [L9]
11. As a developer of this tool, I want the scoring arithmetic pinned by tests that do not break when I retune a weight. [L10]

## Requirements

### Shape and scope

1. `scraper/src/scorecard.ts` exports `scoreFindings(findings: Finding[], rulebook: Rulebook): Scorecard`. It is synchronous and pure: it performs no network, disk or database I/O of any kind. [L1]
2. It implements `docs/scoring-pipeline.md` steps 5–11 — look up, score each finding, aggregate per dimension, gate, group by criterion, sort by ROI, render. Step 4 (read back) and step 12 (diff) are not built. [L1]
3. The result is called a **Scorecard**, never an audit, a report, a result or a verdict. An audit is the whole run; a report is how a scorecard is printed. [L2]
4. `scorecard.ts` lives outside every section folder, because it reads findings from every dimension.
5. The scorecard carries no rulebook prose. Title, why and fix are read from the rulebook when the scorecard is printed, for the same reason a finding carries none. [L8]
6. The root `scraper/src/index.ts` collects every section's findings into one array, calls `scoreFindings` once, and prints the result after every section block. [L1] [L8]

### Rulebook changes

7. `criteria.yaml` gains a top-level `defaults` block holding `warn_credit: 0.5`. [L5]
8. `Rulebook` in `types.ts` gains `defaults: { warn_credit: number }`. [L5]
9. `loadRulebook()` throws, naming the field, when `defaults.warn_credit` is missing, is not a number, or lies outside 0 to 1 inclusive. [L5]
10. `render.hidden_but_present` is marked `scored: false` and its `weight` is removed. The check itself is unchanged and still returns `pass` or `warn`. [L7]
11. `criteria.yaml`'s `gates` list gains `access.policy_divergence` with cap 25 and a reason naming that the server blocks every AI agent robots.txt allows. The existing `access.robots_allows_agents` gate at cap 20 is unchanged. [L4]
12. The `Gate` type stays `{ criterion, cap, reason }`. No new gate syntax is added. [L4]

### The policy divergence check

13. `findPolicyDivergentAgents` in `section-a/ua-probe.ts` returns `pass` when no probed agent was challenged or answered with a status of 400 or above, `warn` when some were, and `fail` only when every probed agent was. [L4]
14. Its `skip` when no agent was allowed to probe is unchanged, and its evidence still lists the blocked agents. [L4]

### Scoring each finding

15. Each finding is looked up in the rulebook by `criterionKey` and becomes two numbers, `earned` and `available`: [L5]

    ```
    pass  → earned = weight                  available = weight
    warn  → earned = weight × warn_credit    available = weight
    fail  → earned = 0                       available = weight
    skip  → earned = 0                       available = 0
    ```

16. A finding whose criterion is marked `scored: false` contributes `earned = 0, available = 0` whatever its status. [L7]
17. `earned` and `available` are never written onto a finding. Findings are not modified by scoring. [L1]

### Dimension scores

18. A dimension's score is its summed `earned` over its summed `available`, times 100, the dimension taken from each criterion's rulebook entry. [L3]
19. A dimension whose summed `available` is 0 has no score and is **N/A**, never 0. [L3] [L8]
20. A dimension every one of whose rulebook criteria is unscored is **observational**. Provenance is the only one today. It never has a score and is never counted as N/A for the total. [L3] [L8]
21. Dimensions appear in the product spec's order — access, render, structure, semantics, documents, provenance. Action is omitted entirely while it has no criteria. [L8]
22. Dimension scores are displayed as whole numbers.

### The total

23. The total is the unweighted mean of the scores of every dimension that has one, excluding observational dimensions. Each dimension counts equally, however many findings it holds. [L3]
24. The total is computed from the unrounded dimension scores and then rounded to a whole number.
25. When access is N/A, no total is computed. The scorecard records that the total was withheld because access could not be measured, so gates could not be checked. [L9]
26. When the total is computed and any non-observational dimension is N/A, the scorecard records which dimensions the total left out. [L9]

### Gates

27. A gate fires when its criterion has at least one finding and every finding for it is `fail`. [L4]
28. When several gates fire, the lowest cap applies. The total becomes the lesser of the uncapped total and that cap. [L4]
29. The scorecard lists every gate that fired, not only the one that bound, and keeps the uncapped total alongside the capped one. [L4] [L8]
30. A gate caps the total only. It never changes a dimension score. [L4]
31. The product spec's third gate — sitewide `text_coverage_ratio` below 0.15, cap 40 — is not built. [L4]

### Fix first

32. Fix first holds every criterion that has at least one `fail` or `warn` finding costing points — scored criteria only. Skips, passes and unscored criteria never appear. [L8]
33. Findings are grouped by criterion, one entry per criterion, listing its affected subjects: the finding `url`s with a `fail` or `warn` status. A subject is a page, the site root, or a document. [L8]
34. Entries are sorted by ROI, highest first, where `ROI = weight × affected subjects ÷ effort` and effort maps `S = 1`, `M = 3`, `L = 6`. Ties go to the higher weight, then to the criterion key alphabetically, so the order is identical across runs. [L8]

### Unreachable site

35. A site is **unreachable** when the page capture got no response at all: both `snapshot.rawHtml` and `snapshot.renderedHtml` are null after capture. A DNS failure, a refused connection, or both halves timing out produce this; a 403 or 500 does not, because the raw fetch records the body of any HTTP response. [L9]
36. An unreachable site stops the run immediately after the page capture, before any other probe. It prints one line — `Could not reach <url> — <error>. No audit produced.` — and exits with a non-zero code. No section block and no scorecard is printed. [L9]
37. The unreachable test is a pure function over a `PageSnapshot`, so it can be tested with `snapshotFrom` and no network. [L9] [L10]
38. A Section A crash never stops the run. `index.ts` keeps catching it; access then has no findings, is N/A, and requirement 25 withholds the total. [L9]

### Output

39. `print-report.ts` gains a function printing the scorecard as two blocks, `=== Scorecard ===` then `=== Fix first ===`, after every section block. [L8]
40. The Scorecard block lists each dimension with its score, then the total, then one `Gate` line per fired gate, in this form: [L8]

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
    ```

41. An N/A dimension states why: `no linked documents found` for documents when the run produced no documents findings, and `no scored findings` otherwise. An observational dimension reads `—  observations, not scored`. [L8]
42. The total line reads `capped from <uncapped>` only when a gate lowered it. [L4] [L8]
43. When the total is withheld, the total line reads `—  not computed: access could not be measured, so gates could not be checked`. [L9]
44. When the total left dimensions out, the total line names them, as in `Total  72  from 4 of 5 dimensions — documents N/A`. [L9]
45. Each Fix first entry prints its rank, the criterion's rulebook `title`, its dimension, severity and effort, the rulebook `why`, the rulebook `fix`, and the affected subjects: [L8]

    ```
    === Fix first ===

      1. Content requires JavaScript to appear          render · critical · effort L
         Many agents fetch raw HTML without executing JavaScript...
         Fix: Server-render primary content, or provide a static fallback
         Affected: https://site.com/
    ```

46. Fix first prints no evidence values. The section blocks above it already print every finding's evidence. [L8]
47. When nothing costs points, Fix first prints a single line saying so.
48. The existing section blocks and `printFindings` are unchanged.

### Documentation

49. `docs/scoring-pipeline.md` records the decisions this Spec settles: warn credit at 0.5 in `defaults`, no `warn_only` flag, the averaged total, gates firing on every-finding-fails, gate 3 deferred, the withheld total, and that steps 5–11 are now built. Its **Open decisions** section is updated to match. [L3] [L4] [L5] [L9]
50. `agent-readiness-auditor-spec.md` §4 records that the total is the mean of the dimension scores and never leads the report, and that the sitewide text-coverage gate waits for the crawler. [L3] [L4]
51. `CLAUDE.md` no longer says there is no scoring engine, describes `scorecard.ts` and its purity, and mentions the scorecard in its `pnpm scraper` row. [L1] [L2]
52. `GLOSSARY.md` was updated during the interview with **Scorecard** and needs no further edit. [L2]

## Technical Decisions

- **In memory, no persistence** [L1]. Everything after the wall in `docs/scoring-pipeline.md` is "pure arithmetic over stored rows", and an in-memory array is stored rows for that purpose. Postgres buys re-scoring and the diff; neither is reachable before a second run exists, and the diff compares findings rather than scores, so building the scorer first costs it nothing.
- **Averaged total, not pooled** [L3]. Pooling earned and available across every finding lets page-scope dimensions swamp site-scope ones once the crawler lands: at 40 pages, access would be about 2% of the total. The average gives each dimension a fixed share whatever the page count. Per-dimension weights can be added to the rulebook later if one dimension should count for more.
- **The total exists, but never leads** [L3]. §4's "do not emit a single 0–100" is honoured by always printing the dimension scores above the total, not by omitting the total. Gates need a number to cap, and comparing runs needs one to compare.
- **Gates fire on every-finding-fails** [L4]. This keeps the `Gate` type and the rulebook syntax unchanged, and it is exactly right for site-scope criteria, which have one finding. It is why `policy_divergence` had to change: gating on "any agent blocked" would cap a whole site at 25 for one minor crawler.
- **Gate 3 deferred** [L4]. It needs an average of an evidence value across pages with its own cutoff, below the check's fail line — machinery the other gates do not — and "sitewide" means nothing on one page. A JavaScript-only site is already penalised across render, structure and semantics, because Sections C and D read raw HTML only.
- **Half credit for a warn, in the rulebook** [L5]. Counting a warn as a fail discards the distinction three statuses were built for; counting it as a pass lets the report flag problems the score ignores. The value is a judgement call, so it lives beside the thresholds. This also settles the scoring doc's warn-only question without a `warn_only` flag: `render.long_redirect_chain` emits only when there is a problem, costs half its weight when present and nothing when absent, which is correct because absence means no problem.
- **`hidden_but_present` unscored** [L7]. Spec 0001 decided it can never fail because a reading agent reads hidden content fine; half credit would still charge the site for it. The unscored flag was built for exactly this.
- **Scorecard carries keys, not prose** [L8]. Titles, why text and fixes are read from the rulebook at print time, matching the rule that a finding carries no title. Rewriting a `fix:` sentence therefore never requires re-scoring.
- **Stop on unreachable, withhold on missing access** [L9]. An unreachable site produces nothing but skips and an absent access dimension, so stopping loses nothing. A Section A crash while the page loaded is this tool's fragility, not the site's problem; stopping would discard five dimensions of valid findings, and because one `try` wraps all of Section A, it would let the rate-limit probe — the least important and most fragile — kill the run. Withholding the total keeps every finding and never shows a number missing access or its gates.

## Testing Strategy

The Test Seam is the established one: synchronous pure functions over literals, asserted with Node's built-in runner, with no network and no browser. [L10]

`findingFrom(overrides)` and `rulebookFrom(criteria, overrides)` are added to `scraper/src/utils.ts` beside `snapshotFrom`, `documentFrom` and `llmsTxtFrom`, for the same reason those live outside every section folder. `rulebookFrom` fills every field a test does not state, and accepts gates and `warn_credit` overrides. [L10]

**Arithmetic tests use hand-built rulebooks** — two or three criteria with round weights such as 10 and 5 — so each expected value is checkable at a glance and retuning `criteria.yaml` never breaks them. This departs deliberately from the rule that tests load the real rulebook: that rule protects threshold names, which checks read by name; the scorer reads weight values, and pinning those would make every weight change look like a bug. Fake rulebooks exist only inside tests; the real audit always loads `criteria.yaml`. [L10]

Tests live at `scraper/src/scorecard.test.ts` and drive off written lists of expectations. Required cases: [L3] [L4] [L5] [L7] [L9] [L10]

- A pass and a fail on equal weights score the dimension 50.
- A warn earns `weight × warn_credit`; changing `warn_credit` in the rulebook literal changes the score.
- A skip contributes nothing to either side: a pass plus a skip scores 100.
- A finding on an unscored criterion contributes nothing, whatever its status.
- A dimension with no scored findings is N/A, not 0, and is left out of the total.
- An observational dimension never has a score and is never named as N/A in the total.
- The total is the mean of dimension scores, not pooled: a dimension with one finding and a dimension with many findings count equally.
- The total is computed from unrounded dimension scores.
- No total is computed when access is N/A, and the withheld reason is recorded.
- A gate fires when every finding for its criterion fails, and not when one is a pass or a warn.
- Two fired gates: the lower cap applies, both are listed, and the uncapped total is kept.
- A gate whose cap is above the uncapped total fires but does not lower it.
- A gate never changes a dimension score.
- Fix first holds fails and warns only, excludes unscored criteria, groups one entry per criterion with its affected subjects, and sorts by ROI with the stated tie-breaks.

**One test loads the real `criteria.yaml`**, scores a realistic findings array spanning every dimension, and asserts only shape: every dimension present in order, action absent, provenance observational, the total between 0 and 100. It never asserts an exact score. It catches the real rulebook drifting out of step with the scorer. [L10]

**Rulebook and check tests:**

- `loadRulebook()` loads the real file with `defaults.warn_credit` present. [L5]
- `render.hidden_but_present` in the real rulebook is `scored: false` with no weight. [L7]
- `findPolicyDivergentAgents` returns `pass` with none blocked, `warn` with some, `fail` with all, and `skip` with no probes — tested with `AgentsProbeResult` literals, the first test in Section A. [L4]
- The unreachable test is true when both halves of a snapshot are null and false for a snapshot holding a 403 or 500 body. [L9]

Nothing in a test catches what the scorer throws.

Manual verification: `pnpm scraper <url>` against a healthy site prints both blocks with a total; against a host that does not resolve it prints the one-line message and exits non-zero; and against a site with no linked PDFs the documents line reads N/A with its reason and the total names it. `pnpm lint` and `pnpm --filter scraper test` pass.

## Out of Scope

- Persistence of any kind: a database, tables, migrations, reading findings back, and comparing runs (`docs/scoring-pipeline.md` steps 4 and 12). [L1]
- The sitewide text-coverage gate and any gate syntax beyond `{ criterion, cap, reason }`. [L4]
- Per-dimension weights in the total, and per-criterion warn credit. [L3] [L5]
- Evidence values in the Fix first block. [L8]
- The action dimension, which has no criteria. [L8]
- Telling a Section A crash apart from access not applying, and making Section A's probes never throw. [L9]
- Validating that every finding's key resolves in the rulebook. [L6]
- Markdown report generation (build order step 5), the web form and job queue (step 6).
- Splitting `criteria.yaml` into one file per dimension.

## Open Questions

- **What the scorer does with a finding whose key is not in the rulebook** [L6]. The user skipped the question. A throw naming the key was recommended; with no requirement, the behaviour is left to implementation. At the time of the interview all 32 keys in the check code matched the 32 in `criteria.yaml`, so nothing fires today.
- **0.5 is a working assumption, not a measurement** [L5]. It was the unwritten rule before this Spec wrote it down.
- **Equal dimension weighting** [L3]. Every dimension counts the same in the total. Whether access should count for more is unexamined; the averaged design leaves room for a per-dimension weight later.

## Follow-Ups

- Build the sitewide text-coverage gate once the crawler exists and "sitewide" means more than one page. [L4]
- Bring Section A's probes under the never-throw discipline, so a crash in one probe no longer costs the others and the scorecard can tell "could not measure" from "does not apply". [L9]
- `docs/scoring-pipeline.md`'s "Criterion keys emitted today" lists Sections A, B, F and G but not C or D — a pre-existing gap noticed during Spec 0005.
- `provenance.llms_txt`'s `why` text in `criteria.yaml` still says "Adoption is real", which Spec 0005's rewrite of the product spec's §3 G no longer supports.

## Notes

The `policy_divergence` change interacts with robots.txt: only agents robots.txt allows are probed, so a site whose robots.txt allows one agent and whose server blocks that one fails `policy_divergence` and is capped at 25, while `robots_allows_agents` warns. Every agent is then blocked by one layer or the other, so the cap is intended.

`GLOSSARY.md` gained **Scorecard** during the interview: "What one audit's findings amount to under the rulebook — a score per dimension, a total, the gate that capped it if any, and the problems in the order worth fixing them." [L2]
