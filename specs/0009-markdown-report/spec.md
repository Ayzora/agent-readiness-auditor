---
type: Spec
title: Markdown report
---

## Problem

A run's only output is the terminal. That output is built for the person running the tool: every section block, every pass, evidence cut off at 160 characters, and a Fix first list with no evidence at all. It can't be kept, sent to a site owner, or read by someone who doesn't know the codebase. [L1]

The spec's build order plans a Markdown report as step 5, and its §10 sets out what the report should say. `docs/scoring-pipeline.md` step 11 records that quoting evidence in each Fix first entry "waits for the Markdown report". [L1] [L2]

The database will store findings eventually, but it won't replace the report. Rows of findings are the record. Something still has to turn them into a document a person reads, and that something should work before the database or the web app exists. [L2]

## Proposed Outcome

Every `pnpm scraper <url>` run that reaches the site also saves a **report**. A report is one Markdown document that shows the run's Scorecard to the person who has to fix the site: the rulebook's words beside the findings' evidence. It is saved to `~/Downloads/<host>-<YYYY-MM-DD-HHmmss>.md`. [L1] [L3]

The report has seven parts, in order: [L4] [L6]

1. **Title**: host, date and rulebook version.
2. **Coverage**: what the run sampled, or the one-page fallback notice.
3. **Headline**: the dimension scores, the total, any gate, and the biggest cost.
4. **Access reality check**: what robots.txt says versus what each agent got.
5. **Fix first**: in ROI order, with every affected subject's evidence.
6. **Observations**: the unscored provenance finding.
7. **Not checked**: every skip and why.

The report is a pure reading of the findings, the Scorecard and the rulebook. It adds no scoring and no checks. The terminal output is unchanged except for one final line. [L1] [L7]

This Spec is written for the sampled run of Spec 0008 and its one-page fallback. It is built after Spec 0008. [L1]

## User Stories

1. As a site owner, I want one document I can open, keep and pass on, instead of terminal output I had to copy. [L1] [L3]
2. As a site owner, I want to see first what the run covered: how many pages stood for how many URLs, and which pages it couldn't reach. That way I know what the score means. [L6]
3. As a site owner, I want the scores, any gate that capped the total, and the single biggest cost at the top. [L4]
4. As a site owner, I want to see what my robots.txt promises each AI agent next to what my server actually did when that agent came. [L4]
5. As a site owner, I want each problem in the order worth fixing, with the site's own measured numbers beside it, so I can check the verdict instead of taking it on trust. [L4] [L5]
6. As a site owner, I want to see what the tool could not check and why, so the score doesn't look more complete than it is. [L4]
7. As the operator, I want the report saved without passing a flag, never inside the repository, and never overwriting an earlier one. [L3]
8. As the operator, I want a failed save to leave the finished audit on screen, not crash the run. [L3]

## Requirements

### Saving

1. Every run that produces a Scorecard saves one report. No flag is needed, and no new CLI flags are added. [L3]
2. The report is saved to `~/Downloads/<host>-<YYYY-MM-DD-HHmmss>.md`. `<host>` is the typed URL's host name, and the timestamp is local time when the report is saved. Example: `~/Downloads/example.com-2026-09-24-143012.md`. [L3]
3. Nothing is written inside the repository, and `.gitignore` is not changed. [L3]
4. An existing file is never overwritten. [L3]
5. After the Scorecard and Fix first output, the terminal prints exactly one more line: `Report saved to <absolute path>` on success, or `Report not saved — <reason>.` on failure. [L3] [L7]
6. When `~/Downloads` doesn't exist or can't be written to, the folder is not created and no other location is tried. The run prints the not-saved line and exits with the same code it would have used without the report. [L3]
7. A site that is unreachable, where the run stops before any section runs, produces no report. The existing "No audit produced" behaviour is unchanged. [L3]
8. This overrides Spec 0008's requirement 39 ("nothing is written to disk"), for the report file only. [L3]

### Title

9. The report opens with `# Agent-readiness report — <host>`. Under it are the run's date and the rulebook's `version`. [L4]

### Coverage

10. A `## Coverage` section follows the title and comes before the Headline. [L6]
11. In a many-page run, it contains: [L6]
    - A summary line: `Sampled N pages from M templates, out of E eligible URLs in <sitemap URL>.`
    - A table with the columns `Template | URLs in sitemap | Sampled | Sampled pages`, with one row per sampled template. The sampled pages are listed by URL.
    - Only when non-zero: a line giving the number of templates not sampled because of the 40-page cap.
    - Only when non-zero: a line giving the number of pages not captured because the 15-minute limit was reached.
    - Only when there are any: `Unreachable: <urls>.` Unreachable sampled pages produce no findings, so this is the only place they appear.
12. In a one-page fallback run, the section contains only Spec 0008's fallback notice, word for word (for example `No sitemap found — auditing only <url>. Results cover one page, not the site.`). It has no table. [L6]

### Headline

13. A `## Headline` section holds a table of the six scored dimensions. Each row shows the rounded score, or `N/A` with the same note the terminal prints (`no linked documents found`, `no scored findings`). Provenance is shown as observational, not scored. [L4]
14. Below the table: the total. When the total is withheld, capped or computed from fewer dimensions, the report uses the same wording as the terminal. [L4]
15. Every gate that fired is listed with its reason from the rulebook and its cap. [L4]
16. Then `Biggest cost: <title of Fix first #1>`, where the title comes from the rulebook. When Fix first is empty, the line is replaced by the terminal's `Nothing to fix — no scored finding lost points.` [L4]
17. The report generates no prose of its own. Every sentence that describes a criterion, a gate or a fix comes from the rulebook. [L4]

### Access reality check

18. A `## Access reality check` section holds a table with one row per agent in the agent list, and the columns `Agent | robots.txt | What happened`. [L4]
19. The `robots.txt` column shows whether that agent is allowed, disallowed at the site root, or disallowed on the audited page. It is taken from `access.robots_allows_agents`'s evidence. [L4]
20. The `What happened` column shows exactly one of the following, taken from the access findings' evidence: [L4]
    - `got through`
    - `asked to pay`
    - `blocked (<cause>)`, where the cause is for example `HTTP 403` or `challenged`
    - `no answer`
    - `not probed — disallowed`

### Fix first

21. A `## Fix first` section lists the Scorecard's Fix first entries in their existing ROI order. [L4]
22. Each entry shows the rulebook title as a heading. Under it are the dimension, severity and effort, then the `why`, then the `fix`. [L4]
23. Each entry then lists every affected subject (page, site or document) as one bullet, with that subject's evidence (requirements 29–33). [L4] [L5]
24. In a many-page run, a page-scope entry also carries Spec 0008's template breakdown, one line per template containing an affected page. Site-scope and document entries have no breakdown. [L4]
25. When there is nothing to fix, the section holds the terminal's `Nothing to fix — no scored finding lost points.` [L4]

### Observations

26. An `## Observations` section lists every unscored criterion's findings, whatever their status, with the rulebook title and the evidence. It says plainly that they cost the site nothing. Today this is `provenance.llms_txt`. [L4]

### Not checked

27. A `## Not checked` section lists every `skip` finding of a scored criterion, grouped by criterion. Each group shows the rulebook title and key, then one bullet per subject with its `reason`. When there are no skips, the section says so in one line. [L4]
28. Individual passes appear nowhere in the report. The report has no Ignore list. [L4]

### Evidence

29. Every criterion's evidence uses the same layout: one bullet per subject, with the subject in code format, then ` — `, then the evidence as `name: value` pairs joined by ` · `. Example: `` - `https://example.com/pricing` — ratio: 0.12 · rawChars: 812 · renderedChars: 6600 ``. [L5]
30. Values are written out in full. There is no 160-character cut-off. [L5]
31. Short lists are joined with commas (`blockedAgents: GPTBot, ClaudeBot`). Objects and other lists are written out in full. [L5]
32. `null` and missing values are written as `—`. [L5]
33. All text taken from the audited site is put in code format, so characters such as `*`, `|`, `<` or a backtick cannot change the Markdown. This covers URLs, template labels, snippets, error messages, causes and any other evidence string. Table cells are escaped so they stay one cell. [L5]

## Technical Decisions

- **One pure renderer.** A new `scraper/src/report.ts` exports `renderReport(input): string`. The input is: [L2] [L7]
  - the findings
  - the Scorecard
  - the rulebook
  - the run's date
  - Spec 0008's sample, or its fallback notice

  The renderer does no network, disk or clock access, so the same input always produces the same text. It sits outside every section folder because, like the Scorecard, it reads every dimension. It is the same function the database era will call with findings read back from storage.
- **Saving lives in `index.ts`.** After the Scorecard prints, `index.ts` reads the clock, builds the Downloads path, writes the file, and prints the saved or not-saved line. It never throws. [L3] [L7]
- **The rulebook supplies the words, and the findings supply the numbers.** This follows `docs/scoring-pipeline.md` step 11. The Scorecard still carries keys and numbers only. Template breakdowns come from the sample at render time, as in Spec 0008. [L4] [L5]
- **The access table is derived from findings, not from the access capture.** The renderer reads `access.*` evidence and the agent list, so it can run on findings read back from a database. [L4] [L7]
- **`print-report.ts` is unchanged.** The terminal output is the operator's view, and the report is a second view of the same Scorecard. [L1] [L7]
- **Vocabulary:** *report* as defined in `GLOSSARY.md`. It is never "scorecard", "audit" or "output". *Template* and *sampled page* keep their glossary meanings. [L1] [L6]

## Testing Strategy

- **Test Seam:** `renderReport`. Tests build findings and a Scorecard with `findingFrom`, rulebooks with `rulebookFrom`, pass a fixed date and a literal sample or fallback notice, and assert on the returned string. There is no network, disk or clock. [L7]
- Tests assert on specific pieces of text and their order, never on a full saved copy of the report. This way, rewording one rulebook sentence doesn't break every test. The cases are a written list of expectations, following the repo convention. [L7]
- **Cases covered, at minimum:** [L4] [L5] [L6] [L7]
  - the seven sections appear in order
  - Coverage for a many-page sample, including the not-sampled, not-captured and unreachable lines
  - Coverage for a fallback run
  - Access table rows for each of the five outcomes
  - Fix first quotes every subject's evidence in ROI order
  - a page-scope template breakdown
  - site text containing `|`, `*` or a backtick cannot break a table or the formatting
  - `null` shown as `—`
  - nothing to fix
  - a capped total
  - a withheld total
  - no skips
  - an unscored finding under Observations and not under Not checked
- **Verified by hand, not unit-tested:** saving to `~/Downloads`, the final terminal line, and the not-saved path when the folder is missing. This matches how Section A's Phase 1 fetches are verified. [L3] [L7]

## Out of Scope

- Storing the report in the database (`audit.report_md`), and rebuilding it from stored findings. These wait for the database Spec. [L2] [L3]
- The web report page and browser downloads. [L2]
- Any report file inside the repository, a `--report` flag, and printing the Markdown to the terminal. [L3]
- The Ignore list. It waits for rulebook content. [L4]
- Per-criterion evidence sentences, such as "812 chars without JS". If they come later, their wording belongs in `criteria.yaml`. [L5]
- Any change to scoring, ROI or checks. [L1]

## Open Questions

- The "ongoing task" the build waits for was taken to be Spec 0008 (sitemap-driven page sampling). The user didn't object, but didn't name it either.
- Requirement 27 keeps unscored skips (such as `provenance.llms_txt` skipping on a fetch error) under Observations rather than Not checked. This split was derived here, not discussed.

## Follow-Ups

- Update `CLAUDE.md` (the `pnpm scraper` command row and a short description of the report) and `docs/scoring-pipeline.md` step 11's "As built" note, so both say that the report quotes evidence per Fix first entry.
- When the database lands, decide whether `audit.report_md` stores the rendered text or whether the report is always re-rendered from findings.

## Notes

- `GLOSSARY.md` gained the **Report** term during the interview.
- The spec's §10 asks for "one sentence on the single biggest cost". Because the report writes no prose of its own, that sentence is the rulebook title of Fix first #1.
