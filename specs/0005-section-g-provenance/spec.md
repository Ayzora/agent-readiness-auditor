---
type: Spec
title: "Section G (provenance): one unscored llms.txt check"
---

## Problem

Sections A–D and F ask what an agent can fetch, what survives without JavaScript, whether the raw HTML is shaped to be read, whether the page's facts are declared machine-readably, and whether facts are locked inside a linked file. None of them asks the cheapest question of all: has the site published anything **for** agents, saying how to read it?

The product spec's §3 G names three items — `llms.txt`, `security.txt`, and machine-readable content licensing — and attaches a warning to the dimension rather than a design: score it low and say so, because every competitor overstates it.

Two of the three did not survive scrutiny. A reading agent never fetches `security.txt`, which is an address for security researchers [L5]. And there is no widely adopted convention for declaring AI-usage terms to an agent at all: the only one agents actually consult is robots.txt agent blocks, which Section A already reads, while IETF `aipref` is a draft, RSL is months old, TDM `tdmrep.json` has near-zero adoption, and `<link rel="license">` declares copyright rather than AI permission [L3].

What remains is `llms.txt`, and the product spec's own framing of it is out of date. The v2 proposal reports thousands of publishing sites, automatic generation by several documentation platforms, Lighthouse auditing for it, and the AI labs publishing their own — not the "~10% and ignored" picture from 2024 [L8]. What is still true is that no major AI provider commits to reading one.

That combination is the design problem. The honest verdict is "worth publishing, and we are not going to charge you for its absence", and the scoring model has no way to express that today: every criterion carries weight, so every criterion moves a score.

## Proposed Outcome

A `scraper/src/section-g/` holding one Phase 1 probe that fetches `/llms.txt` without ever throwing, and one pure check that judges the captured body against the llmstxt.org v2 format — emitting a single `provenance.llms_txt` finding whose verdict is `pass`, `warn` or `skip`, never `fail`.

The criterion is the codebase's first **unscored criterion**: `criteria.yaml` marks it `scored: false`, and it carries no weight. The provenance dimension therefore never produces a score, and the report prints it as an observations block — `Section G — provenance (observations, not scored)` — with the adoption facts in the criterion's `why` text.

Running `pnpm scraper <url>` prints that block after Section F. Section G adds tests in the established pattern, with no network and no fixtures beyond inline strings.

## User Stories

1. As a site owner, I want to know whether I have an `llms.txt` guiding agents to my content, because publishing one is an afternoon's work. [L4] [L8]
2. As a site owner with an `llms.txt` that is a title and nothing else, I want to be told it is a stub, because a file with no links gives an agent nothing. [L4]
3. As a site owner whose host answers `/llms.txt` with a 200 and an HTML error page, I want to be told that, because I currently believe I have one. [L7]
4. As a site owner, I do not want my score reduced for lacking a file no AI provider commits to reading. [L1] [L2]
5. As a site owner, I want the report to say plainly that this was measured and deliberately not counted, with the adoption evidence, so I can judge for myself whether to act. [L2] [L8]
6. As a site owner, I do not want to be told to declare AI-usage terms machine-readably, because there is no agreed way to do it. [L3]
7. As a developer of this tool, I want Section G's verdicts pinned by tests over capture literals, so no test needs a network. [L4] [L7]

## Requirements

### Scope

1. Section G contains exactly one criterion: `provenance.llms_txt`, with `dimension: provenance` and `scope: site`. [L5] [L6]
2. Provenance remains its own dimension, implemented in `scraper/src/section-g/`. `llms.txt` is not filed under access, because access asks whether an agent can get the bytes and `llms.txt` has no effect on that. [L6]
3. No Section G check returns `fail`, under any condition. [L1]
4. No Section G criterion is a gate. [L1]
5. Section G does not check `security.txt`, content licensing, AI-usage terms, WebMCP or API discoverability. [L3] [L5]
6. Section G does not read robots.txt. Agent allow/deny is Section A's, and reading it here would charge a site twice for one thing. [L3]

### The unscored criterion

7. `provenance.llms_txt` is marked `scored: false` in `criteria.yaml` and carries no weight. It is measured and reported, and contributes nothing to any score. [L2]
8. An unscored criterion is marked by the explicit `scored: false` flag, never by `weight: 0`, which is indistinguishable from a forgotten field. [L2]
9. The `Criterion` type gains an optional `scored?: boolean`, defaulting to true when absent, and `weight` becomes optional. [L2]
10. `loadRulebook()` gains one load-time assertion: every criterion not marked `scored: false` must carry a numeric `weight` greater than zero, and the load throws naming the offending key otherwise. Nothing may drop silently out of the arithmetic. [L2]
11. The `Criterion` severity union gains `"info"`. [L8]
12. The provenance dimension produces no score in any run: with its only criterion unscored, it sums `0 earned ÷ 0 available`, the N/A case `docs/scoring-pipeline.md` already defines. [L2]

### The probe — Phase 1

13. `scraper/src/section-g/llms-txt-probe.ts` exports `captureLlmsTxt(url): Promise<LlmsTxtCapture>`. Section G is site-scope, so it owns its own Phase 1 probe, as Section A does. [L6]
14. The probe fetches `/llms.txt` resolved against the audited URL's origin, and no other path. Subpath files (`/docs/llms.txt`), which v2 permits, are not fetched. [L7]
15. `llms-full.txt` is never fetched, and is not recorded in evidence. v2 does not define it. [L4] [L7]
16. The probe **never throws**. A DNS failure, a timeout, a non-2xx status or an unreadable body degrades to a capture with null fields and a populated `error` string, following the capture layer's discipline rather than Section A's older probes'. [L7]
17. Timeout is 10s, matching `section-a/sitemap.ts`. The body is read to a 1 MB ceiling and truncated beyond it. Both are facts rather than judgement calls and stay in code, not the rulebook. [L7]
18. `LlmsTxtCapture` carries: `url`, `statusCode`, `contentType`, `body`, `bytes`, `truncated`, `error`. [L7]
19. The probe performs no parsing. The body is plain text, so deciding what it contains is pure string work and belongs in the check — unlike PDF parsing, which is I/O-shaped and lives in `document-probe.ts`. [L4]

### The check — Phase 2

20. `scraper/src/section-g/llms-txt.ts` exports a synchronous pure check `llmsTxtPresent(url, capture, rulebook): Finding`. [L4]
21. The file counts as **found** only when all three hold: `statusCode` is 200; the body is not HTML (`Content-Type` does not contain `text/html`, **and** the body, after stripping an optional BOM and leading whitespace, does not begin `<!doctype` or `<html`, matched case-insensitively); and the H1 test passes. [L7]
22. **H1**: the first non-empty line, after stripping an optional BOM, matches `/^#\s+\S/`. v2 calls the H1 "the only required section". [L4]
23. **File-list links**: list items matching `/^\s*-\s*\[[^\]]+\]\([^)]+\)/` that appear after the first `^##\s` heading. Their count is the link count. [L4]
24. **Blockquote summary**: any line matching `/^>\s+\S/`. Recorded in evidence only — it never changes the verdict, because a missing summary is a quality nit rather than a stub. [L4]
25. Verdict: `pass` when the file is found and the link count is at least `min_links`; `warn` in every other case — absent, non-200, an HTML body, no H1, or zero links. [L4] [L7]
26. `skip` is returned only when the probe recorded an `error`, with `reason: "llms.txt fetch failed"`. This is the one case where the check genuinely could not run, matching `skip`'s meaning everywhere else in the scraper. [L1]
27. `min_links` is read from the rulebook with `thresholdsFor(rulebook, "provenance.llms_txt")`, never hard-coded, and is `1`. [L4]
28. Evidence carries: `found`, `statusCode`, `contentType`, `looksLikeHtml`, `hasH1`, `hasBlockquoteSummary`, `linkCount`, `bytes`, `truncated`, and `error` when one was captured — enough for the report to distinguish "no llms.txt" from "your 404 page" from "an H1 with no links". [L7]
29. The finding's `url` is the site root (`new URL("/", url).href`), as Section A's site-scope findings are. [L6]

### Rulebook entry

30. `criteria.yaml` gains, verbatim in shape: [L8]

```yaml
- key: provenance.llms_txt
  dimension: provenance
  scope: site
  scored: false
  severity: info
  effort: S
  thresholds:
    min_links: 1
  title: "No llms.txt to guide agents to your content"
  why: >
    An llms.txt lists the pages worth an agent's attention in markdown, so an
    agent spends its budget on your content rather than parsing your
    navigation. Adoption is real — thousands of sites, generated automatically
    by several docs platforms, audited by Lighthouse — but no major AI
    provider commits to reading one, so we report it and do not score it.
  fix: "Publish /llms.txt with an H1 title and links to your key pages as markdown"
```

31. Criterion keys use the dimension, never the section folder: `provenance.llms_txt`, never `section-g.*`. [L6]

### Wiring

32. `scraper/src/section-g/index.ts` exports `runSectionGAudit(url, rulebook): Promise<Finding[]>`, async because the section owns its own site-scope probe. [L6]
33. The root `scraper/src/index.ts` imports only that aggregator, never a section-g internal file, and prints the block after Section F. [L6]
34. The block's title is `Section G — provenance (observations, not scored)`, passed to the existing `printFindings`. No change to `print-report.ts` is required. [L2]
35. The call needs no `try`/`catch`, because the probe never throws. [L7]

### Documentation

36. `agent-readiness-auditor-spec.md` §3 G is rewritten: one check, the two cuts with their reasons, and a positioning note built from the v2 adoption evidence rather than the 2024 picture. [L3] [L5] [L8]
37. `agent-readiness-auditor-spec.md` §4's "Seven dimension scores" becomes six scored dimensions plus one observational. [L2]
38. `CLAUDE.md` gains a Section G description alongside A–D and F, and its `pnpm scraper` row mentions Section G. [L6]
39. `docs/scoring-pipeline.md` records that unscored criteria are excluded from both `earned` and `available`, that provenance is N/A by construction, and adds `provenance.llms_txt` to its "Criterion keys emitted today" list. [L2]
40. `GLOSSARY.md` was updated during the interview and needs no further edit: **Unscored criterion** was added, and **Dimension** now reads "six carry a score; provenance is observational". [L2]

## Technical Decisions

- **Unscored rather than low-weighted** [L2]. Weight already lives only in the rulebook and never on a finding, so making a criterion cost nothing is a YAML decision with no effect on check code. It is also the strongest implementation of the product spec's positioning note: "we measured this and deliberately did not count it" is more conservative than any weight could be. The cost accepted is a new concept in the scoring model before the scorer exists.
- **`scored: false` over `weight: 0`** [L2]. A zero weight is indistinguishable from a forgotten field. An explicit flag lets `loadRulebook()` assert that every scored criterion has a positive weight, which is the only thing standing between a typo and a silently unscored finding.
- **`warn` on absence, not `skip`** [L1]. `skip` means the check could not run. We ran it and found nothing, so `warn` is the honest status; L2's decision is what makes it costless. The one true `skip` is a fetch error.
- **Never `fail`** [L1]. A site with no `llms.txt` is no harder for an agent to read. `render.hidden_but_present` established the same device: a criterion that can only ever report, never condemn.
- **Licensing cut** [L3]. Detecting `<link rel="license">` is trivial, and the resulting advice is unactionable because no convention exists — the same trade the product spec made when it cut CAPTCHA detection as "easy and reliable, but the finding is worthless". It also avoids double-charging against Section A's robots.txt reading, and avoids having to move `section-d/json-ld.ts` to a shared module just so `section-g/` could read schema.org `license` without reaching across sections.
- **`security.txt` cut** [L5]. The audited consumer is a reading agent, and no reading agent fetches it.
- **Provenance kept as a dimension** [L6]. Folding `llms.txt` into access would make access mean two things; it does not affect whether an agent can get the bytes. A one-criterion dimension is unusual, and it leaves the obvious home for WebMCP or IETF `aipref` if adoption ever justifies them.
- **Verdict conditions taken from the v2 format section** [L4]. H1 and file-list links are what the published spec requires and what regex can measure, so the stub test is pinned to the proposal rather than to an invented character count.
- **Parsing in the check, not the probe** [L4]. The body is plain text, so parsing is pure and belongs in Phase 2 — the opposite call from `document-probe.ts`, where PDF parsing is I/O-shaped with its own failure modes. Putting it in the check is also what lets a test pass a real `llms.txt` body as a string and exercise the parser.
- **Presence needs more than a 200** [L7]. The product spec already names this trap for `openapi.json`: a single-page app returns its shell for any path. Content-type, an HTML sniff and the H1 test together are what make "found" mean found.
- **Root only** [L7]. v2 permits `/docs/llms.txt` covering a subpath, but the audit visits one URL today. Revisit when the crawler lands and the run covers ~40 pages.

## Testing Strategy

The Test Seam is the established one: a synchronous pure check over a capture literal, a `Rulebook` loaded from the real `criteria.yaml`, and an asserted `Finding`. No network, no browser, and no fixture files — an `llms.txt` body is an inline string. [L4] [L7]

`llmsTxtFrom(overrides)` is added to `scraper/src/utils.ts` beside `snapshotFrom` and `documentFrom`, building an `LlmsTxtCapture` so tests state only the field under test. It lives outside `section-g/` for the same reason the others do. [L7]

Tests live at `scraper/src/section-g/llms-txt.test.ts`, run by the existing `pnpm --filter scraper test`. No new test dependency. [L4]

Required cases: [L4] [L7]

- A 404 capture → `warn`, with `found: false` in evidence.
- A 200 whose `Content-Type` is `text/html` → `warn`, with `looksLikeHtml: true`.
- A 200 whose content-type is `text/plain` but whose body begins `<!DOCTYPE html>` → `warn`, with `looksLikeHtml: true`, proving the sniff runs independently of the header.
- A valid file — H1, blockquote, an `## Docs` section with three links → `pass`, with `linkCount: 3`.
- The same file prefixed with a BOM → `pass`, proving the BOM is stripped before the H1 test.
- A stub — H1 only, nothing else → `warn`, with `hasH1: true` and `linkCount: 0`.
- A file with an H1 and links written as bare markdown links outside any `##` section → `warn`, with `linkCount: 0`.
- A file with links but no H1 → `warn`, with `hasH1: false`.
- A valid file with no blockquote → `pass`, proving the summary never changes the verdict, with `hasBlockquoteSummary: false`.
- A capture carrying an `error` → `skip` with `reason: "llms.txt fetch failed"`.
- The finding's `url` is the site root, not the audited page URL.

A rulebook test asserts that `loadRulebook()` throws when a scored criterion carries no positive weight, and does not throw for a criterion marked `scored: false`. [L2]

The test file drives off a written list of expectations rather than a directory listing, and nothing in a test catches what a check throws, as elsewhere in the scraper. `min_links` is read through the real rulebook, so renaming it in `criteria.yaml` without renaming it in code fails loudly. [L4]

Probe-level verification is manual: run `pnpm scraper <url>` against a site with a good `llms.txt` (an AI lab's developer docs), a site with none, and a site whose host answers `/llms.txt` with an HTML 404 at status 200, confirming the three distinct verdicts and that an unreachable `llms.txt` never aborts the run. `pnpm lint` must pass. [L7]

## Out of Scope

- `security.txt` at any path. [L5]
- Content licensing and AI-usage declarations in every form: `<link rel="license">`, schema.org `license` / `usageInfo`, `/.well-known/tdmrep.json`, RSL, `noai` meta tags. [L3]
- Reading robots.txt in Section G, including its AI-agent allow/deny lines. [L3]
- `llms-full.txt`, as a criterion or as evidence. [L4]
- Subpath `llms.txt` files such as `/docs/llms.txt`. [L7]
- v2's page-scope additions: `rel="describedby"`, `rel="alternate" type="text/markdown"`, and `.md` versions of pages. [L4]
- WebMCP / `navigator.modelContext`, and API discoverability (`/openapi.json`, `/.well-known/`). Both remain unassigned to any dimension. [L6]
- Validating an `llms.txt` beyond H1, blockquote and file-list links — section ordering, the `## Optional` convention, and whether the linked URLs resolve. [L4]
- Any Section G gate, and any Section G `fail`. [L1]
- Implementing the N/A dimension rule, or unscored-criterion exclusion, in a scorer. The scorer does not exist; Section G records the rules and emits the finding. [L2]

## Open Questions

- **`skip` on a fetch error was not put to the user** [L1]. Requirement 26 is the spec author's reading of `skip`'s established meaning — the check could not run. `warn` would also be defensible, since an agent that cannot fetch `/llms.txt` has no `llms.txt`. Unscored either way, so nothing turns on it arithmetically.
- **The unscored concept lands before the scorer** [L2]. `scored: false` and the N/A-by-construction rule are recorded in the rulebook and in `docs/scoring-pipeline.md` but enforced nowhere, since nothing scores yet. The first scorer must honour both.
- **v2's adoption claims are the proposal author's** [L8]. "Thousands of sites" and the Lighthouse audit come from llmstxt.org itself, not an independent measurement. The `why` text states them as adoption evidence; if the report is challenged on it, an independent figure would be better.
- **Whether one criterion justifies a dimension** [L6]. Provenance is kept partly on the expectation that WebMCP or `aipref` will earn criteria later. If neither does, folding `llms.txt` elsewhere becomes worth revisiting.
- **Root-only weakens once the crawler lands** [L7]. A documentation site publishing `/docs/llms.txt` and nothing at the root warns today, which will read as a false negative to exactly the audience most likely to have one.

## Notes

`GLOSSARY.md` was updated during the interview rather than being left to implementation: **Unscored criterion** was added ("measured and reported but carries no weight, because what it asks about is not adopted widely enough to charge a site for"), and **Dimension** was amended from "one of the seven areas a site is scored on" to "measured on … six carry a score; provenance is observational". [L2]

Section G is the first section whose subject is the site rather than a page or a document, without also probing pages — Section A is site-scope but compares against a page snapshot, while `runSectionGAudit` needs only the URL. [L6]
