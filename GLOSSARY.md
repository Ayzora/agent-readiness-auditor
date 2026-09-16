# Glossary

Stable vocabulary for the Agent-Readiness Auditor. Terms here mean the same
thing in the spec, the rulebook, and the code.

## Terminology

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
One check, one page, one outcome. Carries the criterion key, status and
evidence only — never weight, title or fix text, which come from the rulebook.
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
