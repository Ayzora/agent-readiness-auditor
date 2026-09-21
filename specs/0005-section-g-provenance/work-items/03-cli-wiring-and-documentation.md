---
type: Work Item
title: CLI wiring and documentation
parent: ../spec.md
status: done
---

## What to build

Wire Section G into the CLI, then record the section and its cuts in the four documents that describe the project.

**Wiring** — `scraper/src/index.ts`:

- Import `runSectionGAudit` from `./section-g/index.ts` only, never a section-g internal file.
- Print after Section F with `printFindings("Section G — provenance (observations, not scored)", await runSectionGAudit(url, rulebook))`.
- No `try`/`catch`, because the probe never throws.
- No change to `print-report.ts`.

**Documentation**:

- `agent-readiness-auditor-spec.md` §3 G rewritten: one check, `security.txt` and licensing cut with their reasons, and a positioning note built from the llmstxt.org v2 adoption evidence rather than the 2024 "~10% and ignored" picture.
- `agent-readiness-auditor-spec.md` §4: "Seven dimension scores" becomes six scored dimensions plus one observational.
- `CLAUDE.md`: a Section G description alongside A–D and F, and the `pnpm scraper` row mentioning Section G.
- `docs/scoring-pipeline.md`: unscored criteria are excluded from both `earned` and `available`; provenance is N/A by construction; `provenance.llms_txt` is added to "Criterion keys emitted today".

## Required context

`GLOSSARY.md` was already updated during the interview — **Unscored criterion** added, **Dimension** amended — and needs no further edit.

The two cuts carry reasons worth preserving verbatim in §3 G. `security.txt` is cut because no reading agent fetches it. Licensing is cut because no widely adopted convention exists for declaring AI-usage terms — robots.txt agent blocks are the only thing agents consult, and Section A already reads those, so a licensing criterion would both double-charge and give unactionable advice.

§3 G's existing positioning note is contradicted on the facts by the v2 proposal. Rewrite it; do not carry it forward.

## Acceptance criteria

- [x] `pnpm scraper <url>` prints a `Section G — provenance (observations, not scored)` block after Section F, carrying one finding.
- [x] `scraper/src/index.ts` imports only `runSectionGAudit` from `section-g/`, with no `try`/`catch` around it.
- [x] `print-report.ts` is unchanged.
- [x] An unreachable `/llms.txt` does not abort the run, verified against a real site.
- [x] §3 G describes one check and records both cuts with their reasons.
- [x] §3 G's positioning note reflects the v2 adoption evidence and states that the criterion is reported but not scored.
- [x] §4 says six scored dimensions plus one observational.
- [x] `CLAUDE.md` describes Section G and its `pnpm scraper` row mentions it.
- [x] `docs/scoring-pipeline.md` records the unscored-criterion exclusion, provenance as N/A by construction, and lists `provenance.llms_txt`.
- [x] Manual verification: a site with a good `llms.txt`, a site with none, and a site answering `/llms.txt` with an HTML 404 at status 200 produce three distinct verdicts.
- [x] `pnpm lint` and `pnpm --filter scraper test` pass.

## Covers

- User Story: 6
- Requirements: 1-6, 33-40
- Testing Strategy: manual probe verification
- Interview Ledger: L2, L3, L5, L6

## Blocked by

2. `02-section-g-probe-check-and-tests.md` — there is nothing to wire or describe until the section exists.
