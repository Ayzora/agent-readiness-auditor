---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: What counts as a "document" for Section F, and what single question does the dimension answer?

Recommended Answer:
- The dimension asks: when a page's facts live in a linked file instead of in the HTML, can an agent still read them?
- A document is a PDF, and only a PDF, discovered as a link from a page already captured this run.
- Cut for now: `.docx`, `.xlsx`, `.pptx`, `.csv`.
- Images, video, audio and archives are never documents.

Answer: PDF only.

Decision: Section F judges linked PDFs and nothing else.

Reason: Discovery is format-neutral and cheap — an `href` scan — but three of the four things the product spec asks for (text layer, tagged structure, page count) are inside the file. Opening a `.docx` (a zip of XML) has nothing in common with opening a PDF, so each extra format is its own extraction path, its own tagging question and its own failure modes, for content that is rare on public marketing sites.

Negative Requirements:
- Do not parse Office formats or CSV.
- Do not treat an image, video, audio file or archive as a document.

### L2

Status: current

Question: Does Section F open the documents it finds, or judge them from the outside only (link scan plus `HEAD` for size and type)?

Recommended Answer:
- Open them: fetch each PDF and parse it, accepting a PDF-library dependency, real bytes downloaded from someone else's server, and a fetch budget.

Answer: Open them.

Decision: Section F downloads and parses each in-scope PDF.

Reason: From the outside, a scanned PDF and a well-made one are indistinguishable, and the scan is the most damning finding the dimension can produce. Outside-only inspection could say no more than "this page links six PDFs, one is 40 MB", which is not something a site owner can act on.

### L3

Status: current

Question: Is the premise of this dimension that having PDFs is itself bad for LLM exposure?

Answer: Substantially yes for facts — putting pricing, specs, policies or product facts in a PDF is bad practice for agent exposure — but not for documents whose nature is long-form or fixed.

Decision: Section F's heavyweight criterion is `documents.html_equivalent` — key facts reachable only inside a PDF. The PDF-quality checks are lower-weight support.

Reason: Retrieval systems handle HTML far better than PDF: a PDF loses its links, its reading order is inferred, it chunks badly, and many reading agents fetch the page and never follow the PDF link. "It's in the PDF" usually means the agent will not have it. But a 60-page manual, a datasheet, a signed filing or a printable form has no HTML equivalent by nature, and failing a site for those is the overstatement the product spec's positioning notes are written against.

Negative Requirements:
- Do not deduct for the mere presence of a PDF.
- Do not fail a document that is not a key document for lacking an HTML equivalent.
- Rulebook prose must state that PDFs are readable by some agents, and that the cost is unreliability and skipped fetches rather than impossibility.

### L4

Status: current

Question: Is a Section F finding about the document, or about the page that links it?

Recommended Answer:
- The document is the unit: one finding per criterion per document, `url` set to the document's absolute URL.
- Deduplicate by resolved URL across the whole run.
- A page linking no PDFs contributes no Section F findings at all.
- Evidence carries a capped `linkedFrom` list so the report can still name the linking pages.

Answer: Agreed.

Decision: Findings are document-scoped, deduplicated by resolved URL per run, with the linking pages recorded in evidence.

Reason: The defect lives in the file, and the fix is one edit to one file. `docs/scoring-pipeline.md` groups the report by `criterion_key` and diffs on `criterion_key` + `url`, so a footer PDF linked from 40 sampled pages would otherwise fail 40 times, swamp the dimension score, and be reported as "affects 40 pages" when it is one file.

### L5

Status: current

Question: What is the documents score for a site that links no PDFs at all?

Recommended Answer:
- The dimension is not scored. It reports as N/A, not 0, and the total is computed over the dimensions that produced a score.
- Never award a pass for the absence of documents.

Answer: Agreed.

Decision: A run that produced no document findings reports `documents` as not applicable.

Reason: The scoring pipeline's arithmetic gives `0 earned ÷ 0 available`, which is not a score. This is the trap the product spec names for Section E — a dimension built from things most sites lack either scores a restaurant 0 unfairly, or produces nothing. Awarding a pass for having no PDFs would score a restaurant and a law firm identically and say nothing true about either.

### L6

Status: current

Question: Which criteria does Section F contain, and at what weights?

Recommended Answer:
- `documents.html_equivalent` — heavy, the headline.
- `documents.text_layer` — heavy: the file is a scan with no extractable text.
- `documents.reachable` — high: an agent asked for the file and did not get it.
- `documents.tagged_structure` — low: no declared headings or reading order.
- `documents.size` — low: page count and bytes past the point an agent gives up.

Answer: Agreed, with `documents.reachable` added during L10.

Decision: Five criteria, all `dimension: documents`, all `scope: document`.

### L7

Status: current

Question: How does `documents.html_equivalent` decide a document's content is not available as HTML, with no crawler?

Recommended Answer:
- Two conditions, both required: the document is a key document (matched against a rulebook keyword table on anchor text and filename), and its Document coverage ratio against the run's captured HTML is low.
- A document matching nothing in the table is not judged by this criterion.
- Section F is run-scope: the comparison needs every page captured this run.

Answer: Agreed.

Decision: `documents.html_equivalent` fires only for key documents, and judges them on measured overlap with the run's HTML.

Reason: Keyword alone would fail the sites doing it right — an HTML pricing page with a "download PDF" link beside it matches `pricing` every time. The overlap measurement is the only thing that separates those two sites, and it is the only evidence the report can quote back.

Negative Requirements:
- Do not fail a document on keyword match alone.
- Do not judge a non-key document for its HTML equivalent.

### L8

Status: current

Question: How is the overlap measured — line sampling, regex, or a text-similarity measure?

Recommended Answer:
- One-directional word-sequence containment: normalise the PDF's text, cut it into overlapping 8-word sequences, and score the fraction of them present in the combined sequence set of the run's captured HTML.
- Thresholds in the rulebook: below ~0.2 fail, 0.2–0.6 warn, above pass.
- Ignore sequences appearing on every captured page, so nav and footer boilerplate cannot manufacture a match.

Answer History:
- Initial proposal: match the 20 longest lines of the PDF against the page text.
- Revised, at the user's suggestion: a text-similarity measure over the whole document.
- Final: one-directional containment over 8-word sequences.

Answer: Use a similarity measure, made one-directional.

Decision: The measure is the Document coverage ratio — the fraction of the document's 8-word sequences found in the run's HTML.

Reason: Line matching fails because PDF text extraction produces ragged line breaks, including mid-sentence breaks and interleaved columns. Regex fails because it matches exact patterns, so a curly quote or `£` written as `GBP` misses content that is plainly there. Symmetric similarity fails because the two texts are wildly different lengths: a 40-page PDF scores low against a 600-word page even when the page carries the same facts. The question is one-directional — how much of the document can be found in the HTML — so the measure must be too. 8 words is long enough that common phrasing does not match accidentally and short enough to survive small edits.

### L9

Status: current

Question: Which PDFs get downloaded, and what are the caps?

Recommended Answer:
- Discovery from `rawHtml` only: `<a href>` whose path ends `.pdf`, case-insensitive, query string ignored, resolved to absolute.
- Judge only documents on the site's own registrable domain; record others without fetching.
- Deduplicate by resolved URL before fetching.
- At most 10 documents per run, key documents first, then page order.
- Sequential, never parallel.
- 25 MB ceiling checked from `Content-Length` before downloading the body; stream and abort at the same ceiling when the header is absent.
- 15s per document, 90s total.
- Confirm it is a PDF by the leading `%PDF-` bytes, not by extension or header.
- The probe never throws.

Answer: Agreed.

Decision: The document probe follows those discovery rules, caps and politeness constraints, and degrades rather than throwing.

Reason: The probe puts load on someone else's infrastructure, the same class of change as the rate-limit probe. A PDF on a third party's domain is not the audited owner's to fix. Never throwing matters because the fetches are sequential: one timeout on document three must not cost the run documents four to ten, which is why `page-snapshot.ts` works this way and why `index.ts` still has to wrap Section A's older probes in a try/catch.

### L10

Status: current

Question: What counts as "login-protected", and what happens to a gated document's other checks?

Recommended Answer (rejected as too much work):
- A five-branch taxonomy on `documents.reachable`: fail for a 401, a sign-in redirect or HTML carrying a password field; fail for 404/410; skip for 403/429/bot challenge to avoid charging twice for Section A's `access.policy_divergence`; skip when not fetched; pass otherwise.

Answer: Simplify. A login-protected PDF is an immediate fail; do not build the taxonomy.

Decision: `documents.reachable` has one rule — the bytes we received start with `%PDF-`, or the document fails, whatever the cause. The only `skip` is when the probe chose not to fetch. Evidence records status code, final URL and content type so the report can still explain why.

Reason: Branch-per-cause is a lot of machinery for a verdict that is the same in every branch. An agent that asked for the file and got a login page, a 404, a challenge or a timeout has the same outcome: no document. The rejected carve-out for edge blocks is accepted as a small double-charge risk, because Section A probes pages rather than documents and a 403 on this specific file is still a fact about this file.

Negative Requirements:
- Do not branch `documents.reachable` on the cause of failure.
- Do not emit the other four checks for a document that was never opened.

### L11

Status: current

Question: Where does the PDF fetching live, and what shape does Section F's entry point take?

Recommended Answer:
- `scraper/src/document-probe.ts` — Phase 1, outside `section-f/`, returning `DocumentCapture[]` of plain data, never throwing.
- `scraper/src/section-f/` — pure checks only, no network code.
- `runSectionFAudit(snapshots, documents, rulebook)`, synchronous, taking the plural snapshots because `documents.html_equivalent` compares against every page captured this run.
- PDF parsing happens in the probe, not the checks.

Answer: Agreed.

Decision: Section F splits into a non-throwing Phase 1 probe outside the section folder and a synchronous pure Phase 2 aggregator inside it.

Reason: A function that cannot `await` cannot fetch, so the synchronous signature enforces the Phase 1 / Phase 2 rule instead of a comment requesting it — the reasoning `CLAUDE.md` records for `runSectionBAudit`. Parsing in the probe keeps the I/O-shaped failure modes on the network side and means a check test builds a `DocumentCapture` literal and needs no PDF library at all.

### L12

Status: current

Question: Which PDF library, and what exactly do the three quality checks measure?

Recommended Answer:
- `pdfjs-dist`: `getTextContent()` per page, `numPages`, and `getMarkInfo()` for tagging — one dependency for all three questions.
- `documents.text_layer`: average extractable characters per page, `fail` below `min_chars_per_page: 50`, `warn` below `200`.
- `documents.tagged_structure`: binary, no thresholds.
- `documents.size`: `max_bytes` (warn 5 MB, fail 20 MB) and `max_pages` (warn 50, fail 200), worst wins.

Answer: Go with `pdfjs-dist`.

Decision: `pdfjs-dist` is the parser, and the three quality checks measure characters per page, declared tagging, and bytes plus page count.

Reason: `pdf-parse` wraps an old pdf.js fork and cannot see tagging; `pdf-lib` cannot extract text. `pdfjs-dist` is the first genuinely heavy dependency in `scraper` — it is the legacy ESM build, works under Node without a browser, and needs its worker disabled explicitly.

### L13

Status: current

Question: What does the rulebook gain for Section F, and does `Criterion.scope` need a third value?

Recommended Answer:
- Add `scope: document` alongside `page` and `site`, so the scorer counts documents as documents rather than miscounting files as pages.
- Add a `key_topics` list on `documents.html_equivalent` only, shaped like `required_properties` on `semantics.required_properties`, read through a throwing `keyTopicsFor(rulebook, criterionKey)` helper.
- Widen the glossary's `Finding` definition, which currently reads "one check, one page, one outcome".

Answer: Accepted on the user's instruction to use best judgement and wrap up.

Decision: `Criterion.scope` gains `"document"`, `Criterion` gains `key_topics?: string[]`, and `utils.ts` gains `keyTopicsFor`.

Reason: A document is neither page nor site — it is fetched once per run however many pages link it. What counts as a key document is a judgement call that will be tuned once real audits exist, so it belongs in YAML; the `%PDF-` magic bytes and the 8-word sequence length are facts and stay in code, the line `CLAUDE.md` already draws.
