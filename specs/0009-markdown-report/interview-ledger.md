---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: What is the Markdown report, who reads it, and which run does it describe?

Recommended Answer:
- The report is one Markdown document showing one run's Scorecard to a site owner who has to go fix things, built from the findings, the Scorecard and the rulebook's words. It adds no new scoring and no new checks.
- It follows the spec's §10 structure (Headline, Access reality check, Findings by ROI, Ignore list), refined in L4.
- The terminal output stays as it is, as the operator's debugging view. The report is a second view of the same Scorecard, not a replacement.
- It is shaped for the sampled many-page run from day one: every finding names its subject, even when there is only one.

Answer: We are only writing the Spec for the Markdown report now. It is built after the ongoing task (Spec 0008, sitemap-driven page sampling) has finished building.

Decision: The report is a pure reading of one run's findings, Scorecard and rulebook, written for Spec 0008's sampled run and its one-page fallback. Implementation waits for Spec 0008.

Reason: The user asked whether "one run" meant every URL on the site. It does not: a run covers the sampled pages (or, in the fallback, the typed URL), plus the site-scope checks. The report must say which.

Negative Requirements:
- No new scoring and no new checks.
- The terminal output does not change except for one final line (L3).

### L2

Status: current

Question: Is a Markdown report necessary if results will eventually be saved to a database?

Recommended Answer:
- Yes. The database stores the answers (findings); the report is what turns them into something a person can read, whatever they are read from.
- Build Markdown now as one pure function `(findings, scorecard, rulebook) → Markdown text`, so the same function later reads findings back from the database unchanged.
- Whether to also store the finished text in `audit.report_md` is left to the database Spec.

Answer: Accepted — Markdown now.

Decision: The report is Markdown, produced by a pure function. Database storage of the report is out of scope.

Reason: Markdown works before the database and web app exist, the web report page can show the same text later, and it is plain text that is easy to diff and test. Building the report straight into a web page would mean no report until build steps 3 and 6.

### L3

Status: current

Question: Where does the report go when a run finishes?

Recommended Answer:
- Every run saves `~/Downloads/<host>-<YYYY-MM-DD-HHmmss>.md`, with no flag.
- Nothing is written inside the repository, and nothing is added to `.gitignore`.
- The terminal output gains one final line: `Report saved to <path>`.
- The timestamp keeps runs separate; a report is never overwritten.
- If `~/Downloads` does not exist or cannot be written to, the folder is not created and no other location is tried; the run prints `Report not saved — <reason>.` and exits normally.
- An unreachable site produces no report.
- Saving to the database is out of scope.

Answer: Yes, save to Downloads.

Decision: The report is saved to the user's Downloads folder on every run, never inside the repository.

Answer History:
- Initial recommendation: `scraper/reports/<host>-<timestamp>.md`, gitignored.
- The user rejected any new files in the codebase: the report goes either to the database or to the user's Downloads folder.
- Final answer: the Downloads folder now; the database later, in its own Spec.

Negative Requirements:
- Never write a report inside the repository.
- Never create `~/Downloads` and never fall back to another location.
- Never overwrite an earlier report.
- A failed save never fails the run.

Reason: This deliberately overrides Spec 0008's requirement 39 ("nothing is written to disk") for the report file only.

### L4

Status: current

Question: Which sections does the report have, and in what order?

Recommended Answer:
1. Title and coverage: `# Agent-readiness report — <host>`, the date, the rulebook version, and what was covered.
2. Headline: a table of the six dimension scores (N/A and observational shown as the terminal shows them), the total, any gate that capped it with the gate's reason, and `Biggest cost: <title of Fix first #1>`.
3. Access reality check: one row per agent, `Agent | robots.txt | What happened`, where the last column is got through, asked to pay, blocked (with its cause, e.g. `HTTP 403` or `challenged`), no answer, or `not probed — disallowed`.
4. Fix first: in ROI order, each entry with title, dimension · severity · effort, why, fix, and every affected subject with its evidence, plus Spec 0008's template breakdown in a many-page run.
5. Observations: the unscored provenance finding with its evidence, labelled as costing nothing.
6. Not checked: every skip, grouped by criterion, with the subject and the skip reason.
- Out of this Spec: the Ignore list, which waits for rulebook content. Passes appear only as counts.

Answer: Yes, that structure works.

Decision: The report's sections, in order, are Title, Coverage (L6), Headline, Access reality check, Fix first, Observations and Not checked.

Reason: §10's "one sentence on the single biggest cost" cannot be generated prose, so it is the rulebook title of Fix first #1. The Ignore list has no source today: no criterion in `criteria.yaml` carries "looks like a problem but isn't" text.

Negative Requirements:
- No generated sentences; every sentence of prose comes from the rulebook.
- No Ignore list section.
- No individual passes.

### L5

Status: current

Question: How is evidence written in the report?

Recommended Answer:
- One shared layout for every criterion: each affected subject is one bullet — the subject in code format, then its evidence as `name: value` pairs joined by ` · `.
- Lists and objects written in full, with no truncation; short lists joined with commas.
- A null value is written as `—`.
- Every piece of text taken from the audited site (URLs, snippets, error messages) is in code format, so `*`, `|` or `<` cannot break the Markdown.
- Out of scope: per-criterion sentences such as "812 chars without JS". If they come later, their wording belongs in `criteria.yaml`.

Answer: Happy to continue with the recommendation.

Decision: Evidence uses one generic `name: value` layout for every criterion, in full, with site-derived text in code format.

Examples:
- `` - `https://example.com/pricing` — ratio: 0.12 · rawChars: 812 · renderedChars: 6600 ``

Reason: Accurate for every criterion on day one, needs no new rulebook content, and leaves a clear place for nicer wording later.

### L6

Status: current

Question: In a many-page run, how much of Spec 0008's `=== Pages ===` information goes into the report?

Recommended Answer:
- A Coverage section right after the title, before the Headline.
- A summary line: `Sampled N pages from M templates, out of E eligible URLs in <sitemap URL>.`
- A table with one row per template: `Template | URLs in sitemap | Sampled | Sampled pages`.
- Only when they apply, one line each: templates not sampled because of the 40-page cap, pages not captured because the 15-minute limit was reached, and `Unreachable: <urls>.`
- In the one-page fallback, the section holds only Spec 0008's fallback notice, word for word, with no table.
- The title's coverage line from L4 moves into this section.

Answer: Yes, include the Coverage section.

Decision: The report carries a Coverage section describing what the run sampled, or the fallback notice alone in a one-page run.

Reason: A site score means little unless the reader sees how many pages stand for how many URLs, and an unreachable page left out without a word would flatter the score. The user asked what a template is; the answer followed `GLOSSARY.md`'s definition (a group of sitemap URLs sharing a path shape).

### L7

Status: current

Question: Where does the report-building code live, and how is it tested?

Recommended Answer:
- One new source file, `scraper/src/report.ts`, exporting one pure function `renderReport(input): string`. The input is the findings, the Scorecard, the rulebook, the run's date, and Spec 0008's sample or fallback notice. No network, no disk, no clock inside it. It sits outside every section folder because it reads every dimension.
- Saving happens in `index.ts` after the Scorecard prints: it reads the date, builds the path from the typed URL's host name and local time, writes the file, prints the saved or not-saved line, and never throws.
- Tests in `scraper/src/report.test.ts` use `findingFrom` / `rulebookFrom` and a written list of cases, and assert on specific pieces of text and their order rather than a full saved copy of the report.
- Saving to Downloads is verified by hand.
- `print-report.ts` and the terminal output do not change, apart from the final line.

Answer: Yes, a new `report.ts` is fine.

Decision: The report is rendered by a pure `renderReport` in a new `scraper/src/report.ts`, saved by `index.ts`, and tested through `report.test.ts`.

Reason: The user's "no new files in the codebase" (L3) meant report files, not source files. Passing the date in keeps the same input producing the same text.
