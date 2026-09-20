---
type: Spec
title: "Section F (documents): linked PDFs and whether their facts exist as HTML"
---

## Problem

Sections A–D answer whether an agent can fetch a page, whether its content survives without JavaScript, whether the raw HTML is shaped to be read, and whether the page's facts are declared machine-readably. All four stop at the edge of the HTML document. Nothing yet asks what happens when the facts are not in the HTML at all, because they live in a linked file.

That is a common shape on real sites: the price list is `pricing-2026.pdf`, the specification is a datasheet, the returns policy is a scanned PDF of a signed page. Retrieval systems handle HTML far better than PDF — a PDF loses its links, its reading order is inferred rather than declared, it chunks badly, and many reading agents fetch the page and never follow the link at all. "It's in the PDF" usually means the agent will not have it. [L3]

The product spec's §3 F names three items — PDF text layer, tagged structure, page count and size; key documents PDF-only with no HTML equivalent; documents behind login or form-fill — without saying which carries the weight. The interview settled that: the headline is facts reachable only inside a file, and the PDF's own readability is supporting evidence for it. [L3] [L6]

The boundary matters as much as the claim. A 60-page manual, a datasheet, a signed filing or a printable form has no HTML equivalent by nature. Deducting for those is the overstatement the product spec's positioning notes are written against, so the section must judge only documents it has grounds to judge. [L3]

## Proposed Outcome

A Phase 1 `scraper/src/document-probe.ts` that discovers linked PDFs across the pages captured in a run, fetches up to ten of them under strict caps without ever throwing, and parses each one into plain data; and a `scraper/src/section-f/` folder of synchronous pure checks over that data, emitting up to five `documents.*` findings per document.

Running `pnpm scraper <url>` prints a Section F block after Section D, listing findings whose subject is a file rather than a page. Section F adds tests in the established pattern, with no binary fixtures in git.

## User Stories

1. As a site owner, I want to be told when my pricing, specs or policies exist only inside a PDF, so I know agents answering questions about my business do not have those facts. [L3] [L7]
2. As a site owner, I do not want to be marked down for publishing a manual, a datasheet or a printable form, because those have no HTML equivalent by nature. [L3] [L7]
3. As a site owner, I want to be told when a document of mine is a scan with no text in it, because nothing can read it — no agent, and no person using a screen reader. [L6] [L12]
4. As a site owner, I want to be told when a linked document cannot be fetched at all, whether it sits behind a login, has rotted away, or times out. [L10]
5. As a site owner, I want a document that is linked from every page in my footer reported once, as one file to fix, not as forty failing pages. [L4]
6. As a site owner with no PDFs on my site, I want the documents dimension reported as not applicable, rather than scoring zero for something I do not do. [L5]
7. As the owner of a site this tool audits, I want the audit to take a handful of my documents politely and sequentially, not to pull every file it can find as fast as it can. [L9]
8. As a developer of this tool, I want Section F's verdicts pinned by tests over `DocumentCapture` literals, so no test needs a network, a browser or a PDF in the repository. [L11]

## Requirements

### Scope

1. Section F judges linked PDFs and nothing else. Office formats and CSV are not parsed; images, video, audio and archives are never documents. [L1]
2. Section F contains exactly five criteria, all `dimension: documents` and all `scope: document`: `documents.html_equivalent`, `documents.text_layer`, `documents.reachable`, `documents.tagged_structure`, `documents.size`. [L6]
3. `agent-readiness-auditor-spec.md` §3 F is updated to list the five checks, state that discovery reads raw HTML, and record the cut items with their reasons, as §3 D was updated for Section D. [L1] [L3]
4. `CLAUDE.md` gains a Section F description alongside A–D, and its `pnpm scraper` row mentions Section F. [L11]

### Discovery

5. Documents are discovered from `snapshot.rawHtml` only, for every page captured in the run. `renderedHtml` is never read, consistent with Sections C and D. [L9]
6. A candidate is an `<a href>` whose path ends `.pdf`, matched case-insensitively with any query string ignored, resolved against the page's URL to an absolute URL. [L9]
7. Only documents on the site's own registrable domain are fetched and judged. `cdn.example.com` and `files.example.co.uk` count as the site's own; a PDF on a third party's domain is recorded in evidence and never fetched. [L9]
8. Candidates are deduplicated by resolved URL before anything is fetched, so one file linked from forty pages is fetched once and judged once. [L4] [L9]
9. Each capture records every page it was linked from. Evidence carries at most the first five, plus the total count. [L4]

### Fetch budget and politeness

10. At most 10 documents are fetched per run. Key documents are fetched first, then remaining documents in page order. [L9]
11. Documents are fetched **sequentially**, never in parallel. [L9]
12. Before the body is downloaded, `Content-Length` is checked against a 25 MB ceiling. Over it, the body is not downloaded and the capture records the advertised size. With no `Content-Length`, the body is streamed and aborted at the same ceiling. [L9]
13. Timeouts: 15s per document, 90s for the whole probe. Documents the budget does not reach are recorded as not fetched and are not judged. [L9]
14. A document counts as a PDF only when its first bytes are `%PDF-`. Neither the `.pdf` extension nor a `Content-Type` header is sufficient. [L9] [L10]
15. The probe never throws. Every failure — timeout, DNS error, non-2xx status, non-PDF bytes, a parse error from the PDF library — degrades to a capture with null fields and an `error` string. One dead document must not cost the run the other nine. [L9]
16. Evidence records how many documents were discovered versus fetched, so a report never implies every document was examined. [L9]

### Capture shape

17. `document-probe.ts` exports an async probe returning `DocumentCapture[]`, where a `DocumentCapture` carries: `url`, `anchorText`, `linkedFrom` (page URLs), `isKeyDocument`, `statusCode`, `finalUrl`, `contentType`, `bytes`, `fetched`, `isPdf`, `text`, `pageCount`, `isTagged`, and `error`. [L11]
18. PDF parsing happens in the probe, not in a check. The checks read only the parsed fields. [L11] [L12]
19. Parsing uses `pdfjs-dist`: page text from `getTextContent()` joined per page, `numPages` for the page count, and tagging from `getMarkInfo()` with a structure-tree lookup as fallback. The worker is disabled explicitly for Node. [L12]
20. A document that is a key document is flagged during discovery, by matching the criterion's `key_topics` entries as lowercase substrings against the anchor text and the filename. [L7] [L13]

### Emission rules

21. A page linking no PDFs contributes no Section F findings. There is no per-page Section F output. [L4]
22. When a document was never opened — `documents.reachable` failed, or the probe chose not to fetch it — the other checks are **absent**, not `skip`. We have no data and therefore no opinion. [L10]
23. When a document was opened but a check does not apply to it — a non-key document under `documents.html_equivalent` — the check returns `skip` with a distinct `reason`. [L7] [L10]
24. When a document exceeded the 25 MB ceiling and its size was known from `Content-Length`, `documents.size` is still emitted and fails; `documents.reachable` returns `skip` with `reason: "not fetched"`; the remaining three are absent. [L9] [L10]
25. Every `skip` carries a distinct `reason` in its evidence, as elsewhere in the scraper. [L10]
26. A finding's `url` is the document's absolute URL, never the linking page's. [L4]

### `documents.reachable`

27. One rule: the bytes we received begin `%PDF-` → `pass`; otherwise → `fail`, whatever the cause — a login page, a redirect to sign-in, a 404, an edge challenge, a timeout, or HTML served for a `.pdf` URL. The check does not branch on the cause. [L10]
28. `skip` with `reason: "not fetched"` is returned only when the probe chose not to fetch: over the size ceiling, or the run's budget was spent. [L10]
29. Evidence: `statusCode`, `finalUrl`, `contentType`, `bytes`, and the `error` string when one was captured, so the report can say "redirected to /login" or "404" without the check knowing the difference. [L10]

### `documents.html_equivalent`

30. The check runs only for documents flagged as key documents. A non-key document returns `skip` with `reason: "not a key document"`. [L7]
31. The **Document coverage ratio** is computed one-directionally: normalise the document's text (lowercase, collapse whitespace, strip punctuation), cut it into overlapping 8-word sequences, and score the fraction of those sequences present in the combined sequence set built the same way from the raw text of every page captured this run. [L8]
32. Sequences appearing on **every** captured page are excluded from both sides before scoring, so shared navigation and footer text cannot manufacture a match. [L8]
33. Verdicts: below the `fail` threshold (≈0.2) → `fail`; between `fail` and `pass` (≈0.6) → `warn`; at or above `pass` → `pass`. Thresholds live in the rulebook. [L8]
34. Page text for the comparison corpus is derived from each snapshot's `rawHtml`. Pages whose `rawHtml` is `null` are excluded from the corpus. [L8]
35. When the corpus is empty — no page in the run produced raw HTML — the check returns `skip` with `reason: "no HTML captured"`. [L8]
36. Evidence: `coverageRatio`, `sequencesSampled`, `sequencesMatched`, `pagesCompared` (how many pages formed the corpus), and the matched `key_topics` term that made it a key document. [L7] [L8]

### `documents.text_layer`

37. The measurement is average extractable characters per page: `totalChars ÷ pageCount`. [L12]
38. Verdicts: below `min_chars_per_page` (50) → `fail`; below `warn_chars_per_page` (200) → `warn`; else `pass`. A zero page count returns `skip` with `reason: "page count unavailable"`. [L12]
39. Evidence: `pageCount`, `totalChars`, `charsPerPage`. [L12]

### `documents.tagged_structure`

40. Binary, with no thresholds: `pass` when the document declares tagging, `fail` when it does not. [L12]
41. Tagging is declared when `getMarkInfo()` reports `Marked: true`, or when a page structure tree is present. Evidence records which of the two was found. [L12]

### `documents.size`

42. Two measurements, worst verdict wins: bytes against `max_bytes` (`warn` 5 MB, `fail` 20 MB) and page count against `max_pages` (`warn` 50, `fail` 200). [L12]
43. Evidence: `bytes`, `pageCount`, and which of the two produced the verdict. [L12]

### Rulebook

44. `criteria.yaml` gains one entry per new key, `dimension: documents`, `scope: document`, following the existing entry shape. [L6] [L13]
45. `Criterion.scope` in `types.ts` gains `"document"` alongside `"page"` and `"site"`. [L13]
46. `Criterion` gains `key_topics?: string[]`, carried on `documents.html_equivalent` only. [L13]
47. `utils.ts` gains `keyTopicsFor(rulebook, criterionKey)`, mirroring `thresholdsFor` and `requiredPropertiesFor`: a missing table throws rather than returning `undefined`. [L13]
48. The table's starting terms: [L7] [L13]

    ```yaml
    key_topics: [pricing, price, rates, tariff, spec, datasheet,
                 terms, privacy, policy, warranty, returns,
                 shipping, menu, brochure, catalogue]
    ```

49. Starting weights, severities, efforts and report text: [L3] [L6]
    - `documents.html_equivalent` — weight 8, severity high, effort M. Title: "Key information is only available as a PDF". Why: retrieval systems read HTML far better than PDF, and many agents fetch a page without ever following its document links, so facts that exist only inside a file are facts an agent will not have; PDFs are readable by some agents, so this is unreliability rather than impossibility. Fix: "Publish this content as a web page, and keep the PDF as a download".
    - `documents.text_layer` — weight 7, severity high, effort L. Title: "This document is a scan with no readable text". Why: the file contains an image of text rather than text, so nothing can read it — no agent, no search engine and no screen reader. Fix: "Republish the document with a real text layer, or publish the content as HTML".
    - `documents.reachable` — weight 7, severity high, effort S. Title: "This document could not be fetched". Why: an agent that follows this link receives a login page, an error or nothing at all, so the document might as well not be published. Fix: "Make the document publicly fetchable, or remove the link".
    - `documents.tagged_structure` — weight 3, severity low, effort M. Title: "This document declares no headings or reading order". Why: without tagging, extracted text arrives in whatever order the file happens to store it, so columns interleave and headings vanish. Fix: "Export the document as a tagged PDF".
    - `documents.size` — weight 2, severity low, effort M. Title: "This document is large enough that agents will skip it". Why: a very large file costs an agent most of its budget to read, so it is commonly skipped. Fix: "Split the document, or publish its key sections as HTML".
50. No Section F criterion is added to the rulebook's `gates:` list. An unreadable document degrades an agent's experience without blocking access to the site. [L5]

### Scoring behaviour

51. A run producing no Section F findings reports the `documents` dimension as **not applicable**, and the overall total is computed across the dimensions that produced a score. The dimension never scores 0 for absence, and absence never earns a pass. [L5]
52. `docs/scoring-pipeline.md` records the N/A rule, the `scope: document` value, and document-scoped findings in its criterion-key inventory. [L5] [L13]

### Wiring and output

53. `scraper/src/section-f/index.ts` exports `runSectionFAudit(snapshots: PageSnapshot[], documents: DocumentCapture[], rulebook: Rulebook): Finding[]`. **The function is synchronous**, for the same reason as Sections B, C and D. [L11]
54. `section-f/` contains only pure check functions and no network code. [L11]
55. The root `scraper/src/index.ts` awaits the document probe once, passes its result plus the captured snapshots to `runSectionFAudit`, and prints with `printFindings("Section F — documents", …)` after Section D. [L11]
56. Criterion keys use the dimension, never the section folder: `documents.*`, never `section-f.*`. [L6]
57. `pdfjs-dist` is added to `scraper`'s dependencies. [L12]

## Technical Decisions

- **PDF only** [L1]. Discovery is format-neutral and cheap, but inspection is not: a `.docx` is a zip of XML with nothing in common with a PDF, so each added format is a separate extraction path, tagging question and failure set, for content that is rare on public sites.
- **Open the files rather than judging from the outside** [L2]. A link scan plus `HEAD` cannot distinguish a scanned PDF from a good one, which is the single most damning finding available here. The cost accepted is a heavy dependency and real bytes pulled from someone else's server.
- **The document is the finding's subject** [L4]. The report groups by `criterion_key` and the diff matches on `criterion_key` + `url`, so document-scoped findings make "is that file still a scan?" answerable across runs, and stop one footer PDF from failing forty times.
- **One-directional containment, not similarity** [L8]. The texts are wildly different lengths, so a symmetric measure punishes a site whose page genuinely covers the PDF's facts. Line matching was rejected because PDF extraction breaks lines mid-sentence and interleaves columns; regex was rejected because exact patterns miss a curly quote or a `£` written as `GBP`.
- **Two conditions for `html_equivalent`** [L7]. Keyword alone fails the sites doing it right — an HTML pricing page beside a PDF download matches `pricing` every time. The measured ratio is what separates them, and it is the number the report can quote.
- **One rule for `reachable`** [L10]. A branch-per-cause taxonomy was designed and rejected as disproportionate: every branch produced the same verdict. The accepted cost is a small double-charge risk when an edge block hits both the page (Section A's `access.policy_divergence`) and its documents, tolerated because Section A probes pages, not files.
- **Absent versus skip** [L10]. Absent means never opened, so there is no opinion to record; `skip` means opened but the question does not apply. Emitting four skips per unreachable document would flood a report with rows that say nothing.
- **Parsing in the probe** [L11] [L12]. It is I/O-shaped work with its own failure modes, and putting it in Phase 1 is what lets a check test build a literal and skip the PDF library entirely.
- **`pdfjs-dist`** [L12]. `pdf-parse` wraps an old pdf.js fork and cannot see tagging; `pdf-lib` cannot extract text. The legacy ESM build runs under Node with its worker disabled.
- **`scope: document` in the rulebook** [L13]. A document is fetched once per run however many pages link it, so it is neither page nor site, and the scorer must not count files as pages.
- **The key-topic table lives in YAML** [L13]. What counts as a key document is a judgement call expected to change once real audits run. The `%PDF-` magic bytes, the 8-word sequence length and the politeness caps are facts and stay in code — the line `CLAUDE.md` already draws.
- **Section F is run-scope** [L7]. `documents.html_equivalent` needs every page captured this run to answer "anywhere in HTML", so the aggregator takes an array of snapshots. Today that array holds one element.

## Testing Strategy

The Test Seam is the existing one, extended by one type: checks are synchronous and pure over `DocumentCapture`, `PageSnapshot[]` and `Rulebook`. A test builds `DocumentCapture` literals directly — `{ pageCount: 12, totalChars: 140, isPdf: true, … }` — loads the real `criteria.yaml` through `loadRulebook()`, and asserts on the returned `Finding`. No network, no browser, and **no PDF files in the repository**. [L11] [L12]

Tests live beside the code as `scraper/src/section-f/*.test.ts`, run by the existing `pnpm --filter scraper test`. No new test dependency. [L11]

Required cases: [L7] [L8] [L10] [L12]

- A capture whose bytes are not a PDF → `reachable` fails; the other four checks are absent from the returned findings.
- A capture the probe chose not to fetch → `reachable` skips with `"not fetched"`, and `size` still fails when the advertised bytes exceed `max_bytes`.
- A key document whose text is absent from the corpus → `html_equivalent` fails, with `coverageRatio` near 0 in evidence.
- A key document whose text is duplicated in a page's raw HTML → `html_equivalent` passes.
- A key document partly mirrored → `html_equivalent` warns.
- A non-key document → `html_equivalent` skips with `"not a key document"`.
- A document whose only matching sequences are nav or footer text repeated on every captured page → `html_equivalent` still fails, proving the boilerplate exclusion.
- An empty corpus (every snapshot's `rawHtml` is `null`) → `html_equivalent` skips with `"no HTML captured"`.
- 40 characters over 12 pages → `text_layer` fails; 150 → warns; 4,000 → passes.
- `pageCount: 0` → `text_layer` skips with `"page count unavailable"`.
- `isTagged: false` → `tagged_structure` fails; `true` → passes.
- A 30 MB, 12-page document and a 1 MB, 400-page document → `size` fails on bytes and on pages respectively, with evidence naming which fired.
- The same document URL linked from three pages appears once in the findings, with `linkedFrom` listing all three.

Key-topic matching is tested through the real rulebook table, so a term renamed in `criteria.yaml` but still assumed in a test fails loudly, and coverage fixtures sit well inside a band so retuning a cutoff does not break them. A test file drives off a written list of expectations rather than a directory listing, and nothing in a test catches what a check throws. [L13]

Probe-level verification is manual: run `pnpm scraper <url>` against a page linking a text-layer PDF, one linking a scanned PDF, and one linking a login-gated PDF, and confirm the Section F block prints the expected verdicts and that an unreachable document does not abort the run. `pnpm lint` must pass. [L2] [L9]

## Out of Scope

- Parsing `.docx`, `.xlsx`, `.pptx` or `.csv`. [L1]
- Treating images, video, audio or archives as documents. [L1]
- OCR of a scanned PDF to recover its text. Section F reports the absence; it does not repair it. [L2]
- Detecting form-fill gating — "download our guide" behind a lead-capture form. The link is to an HTML landing page, not a `.pdf`, so discovery never sees it. [L10]
- Judging PDFs hosted on a third party's domain. [L9]
- Branching `documents.reachable` on the cause of failure. [L10]
- Reading `renderedHtml` anywhere in Section F, for a verdict or for evidence. [L9]
- Any Section F gate. [L5]
- Implementing the N/A dimension rule in a scorer. The scorer does not exist; Section F only records the rule and emits findings. [L5]
- Crawling multiple pages, which is what would make `html_equivalent` accurate sitewide. [L7]
- Migrating Section A's probes to the never-throw discipline. [L9]

## Open Questions

- **`html_equivalent` over-reports until the crawler lands** [L7]. Auditing a single URL, a pricing PDF linked from the homepage fails even when `/pricing` exists as HTML, because that page was never captured. The report text for this criterion must say what it compared against, and the criterion should be re-tuned once the crawler supplies ~40 pages.
- **Whether a timeout should be `skip` rather than `fail`** [L10]. A slow server is not quite the same defect as a login wall, though an agent gets nothing in both cases. Raised, not resolved; the current decision is `fail`.
- **8 words, 0.2 and 0.6 are first guesses** [L8]. The sequence length and both thresholds need tuning against real documents; a shorter sequence raises accidental matches, a longer one breaks on light re-editing.
- **Boilerplate exclusion is crude** [L8]. "Appears on every captured page" works at 40 pages and barely works at one. Revisit alongside the crawler.
- **Starting weights and report text** [L6]. Requirement 49's values are first guesses, the same status as Sections C and D's weights.
- **The 10-document cap interacts with the crawler** [L9]. Ten documents across 40 sampled pages may be too few to be representative once the crawler exists.

## Notes

`GLOSSARY.md` was updated during the interview: **Linked document**, **Key document**, **Document coverage ratio** and **Text layer** were added, and **Finding** was widened from "one check, one page, one outcome" to "one check, one subject, one outcome — the subject being a page, the site, or a linked document". [L4] [L8] [L13]
