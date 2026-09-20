# Glossary

Stable vocabulary for the Agent-Readiness Auditor. Terms here mean the same
thing in the spec, the rulebook, and the code.

## Terminology

**Reading agent**:
An agent that fetches a page to extract its content and never acts on it,
typically without executing JavaScript. The consumer the access, render,
structure and semantics dimensions are scored for.
_Avoid_: crawler, bot, scraper

**Acting agent**:
An agent that drives a real browser session to complete a task on the page,
executing JavaScript, clicking and typing. The consumer the action dimension
is scored for.
_Avoid_: browser agent, user agent, operator

**Dimension**:
One of the seven areas a site is scored on — access, render, structure,
semantics, action, documents, provenance. The dimension name is what appears
in the rulebook and as the prefix of a criterion key (`render.text_coverage`).
_Avoid_: category, area, pillar

**Section**:
The code folder implementing one dimension (`scraper/src/section-b/`). A
section is the implementation; the dimension is the concept. Section B
implements the render dimension.
_Avoid_: using "section" and "dimension" interchangeably in criterion keys
or report text

**Probe**:
A Phase 1 function that performs network I/O and returns plain captured data.
Probes are the only place network access is permitted.
_Avoid_: check, test

**Check**:
A Phase 2 pure function over already-captured data. A check never touches the
network and returns a finding.
_Avoid_: probe, rule, test

**Page Snapshot**:
The paired capture of a single URL — the raw response and the browser-rendered
DOM of the same resolved address, plus status, headers and timing. Shared
input for every page-scope section.
_Avoid_: fetch, crawl, page

**Finding**:
One check, one subject, one outcome — the subject being a page, the site, or a
linked document. Carries the criterion key, status and evidence only — never
weight, title or fix text, which come from the rulebook.
_Avoid_: result, issue, error

**Evidence**:
The measured values a finding was judged on, stored alongside it so the
verdict can be argued with facts rather than accepted.
_Avoid_: details, data

**Rulebook**:
The versioned `criteria.yaml` holding every criterion's weight, severity,
threshold and remediation prose. Identical for every audited site.
_Avoid_: config, rules file

**Gate**:
A criterion that caps the total score regardless of other results, modelling
the fact that downstream quality is worthless behind an upstream block.
_Avoid_: blocker, hard fail

**Text coverage ratio**:
The proportion of a page's text present without JavaScript, measured as raw
text length over rendered text length.
_Avoid_: JS ratio, render score

**Extraction ratio**:
The proportion of a page's raw-HTML text that Readability keeps as main
content, measured as readable text length over all text length. Low means an
agent spends most of its reading on menus, footers and other page chrome.
_Avoid_: noise ratio, content ratio, readability score

**Structured data**:
Machine-readable facts embedded in a page for a reader that is not human. In
this project it means JSON-LD; microdata and RDFa are not read.
_Avoid_: schema, markup, metadata, rich results

**JSON-LD block**:
One `<script type="application/ld+json">` element and the JSON inside it. A
page may hold several blocks, and one block may hold several entities.
_Avoid_: script, snippet, tag

**Entity**:
One object carrying an `@type`, found at the top level of a block, as a member
of a block's array, or as a member of its `@graph`. An object nested inside a
property is part of its parent, not an entity.
_Avoid_: item, node, object, thing

**Declared type**:
The normalised value of an entity's `@type`. An array declares several types,
and a URL form is reduced to its last segment.
_Avoid_: schema type, category, class

**Known type**:
A declared type the rulebook's required-properties table has an entry for.
Only known types are judged; the rest cost a page nothing.
_Avoid_: supported, covered, recognised, valid

**Linked document**:
A non-HTML file a page links to for a reader to open — in this project a PDF
only. Discovered from a page's links, but judged as its own unit, once per
run, however many pages link it.
_Avoid_: attachment, asset, file, download

**Key document**:
A linked document whose anchor text or filename matches the rulebook's
key-topic table — pricing, specs, terms, policies and their kin. Only key
documents are asked whether their content also exists as HTML.
_Avoid_: important document, primary document

**Document coverage ratio**:
The proportion of a document's text that also appears in the site's HTML,
measured one-directionally as the fraction of the document's word sequences
found in the captured pages. Low means the facts exist only inside the file.
_Avoid_: similarity, duplication, match score

**Text layer**:
The extractable text inside a PDF. A PDF without one is an image of text,
readable by nobody who is not looking at it.
_Avoid_: OCR, raw text, content
