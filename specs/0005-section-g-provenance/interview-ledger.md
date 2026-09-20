---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: What happens to the large majority of sites that publish none of Section G's files — do those criteria fail?

Recommended Answer:
- Never `fail`. `pass` when the declaration is present and substantive, `warn` when present but a stub, `skip` when absent.
- A site publishing none would then have all-skipped criteria, which `docs/scoring-pipeline.md` already defines as N/A rather than 0.

Answer: If it is there we pass, if it is not there we warn.

Decision: Section G's checks return `pass` when the declaration is present and substantive and `warn` otherwise. They never return `fail`.

Reason: Absence is not a defect. A site with no `llms.txt` is no harder for an agent to read, so the report must describe the gap as an opportunity, never as a failure. `render.hidden_but_present` already uses the same device — a criterion that can never fail.

Answer History:
- Initial recommendation: absent → `skip`, so the dimension falls out as N/A.
- Final answer: absent → `warn`, made costless by L2's unscored decision rather than by `skip`.

Negative Requirements:
- No Section G check may return `fail`.
- No Section G criterion may be a gate.

### L2

Status: current

Question: With `warn` on absence rather than `skip`, the dimension always produces a score, and what a `warn` is worth becomes urgent. How should that be handled?

Answer: A warn with no weight. This one is a bit of a special case — since it is not widely adopted, we do not take it heavily into consideration.

Decision: Section G's criteria are **unscored**: measured and reported, carrying no weight. The rulebook marks them `scored: false`. The provenance dimension therefore produces no score and renders as an observations block.

Reason: Weight already lives only in the rulebook and never on a finding, so this costs no code in the checks. It is also the strongest possible reading of the product spec's positioning note — "we measured this and deliberately did not count it", with the adoption evidence beside it, is more conservative than any competitor's report. It sidesteps the unresolved warn-credit question in `docs/scoring-pipeline.md` entirely, which still stands for `render.long_redirect_chain`.

Constraints:
- Mark unscored criteria with an explicit `scored: false` flag, not `weight: 0`, which is indistinguishable from a forgotten field.
- The provenance dimension is N/A in every run, by construction.

### L3

Status: current

Question: What counts as a machine-readable licensing / AI-usage declaration — `<link rel="license">`, schema.org `license`, `/.well-known/tdmrep.json` — and is it worth building?

Recommended Answer:
- Cut it. No convention for conveying usage terms to an agent is widely adopted.
- The only one agents actually consult is robots.txt AI-agent blocks, which Section A already reads as `access.robots_allows_agents`.
- IETF `aipref` is the closest fit and still a draft; RSL launched late 2025 and is too new; TDM `tdmrep.json` has near-zero adoption; `noai` meta tags are honoured by nobody; `<link rel="license">` declares copyright, not AI permission.

Answer: Cut it.

Decision: Section G does not check content licensing or AI-usage terms.

Reason: A `warn` reading "declare your AI-usage terms machine-readably" is advice a site owner cannot act on, because there is no agreed way to do it. That is the same reasoning the product spec used to cut CAPTCHA detection — easy and reliable to detect, but the finding is worthless. Cutting it also avoids double-charging against Section A's robots.txt reading, and avoids having to move `section-d/json-ld.ts` out to a shared module to read schema.org `license` from `section-g/`.

Negative Requirements:
- Do not read robots.txt in Section G.
- Do not add a licensing criterion to the rulebook.

### L4

Status: current

Question: What makes an `llms.txt` "non-stub" — which measurable conditions from the official spec decide `pass`?

Source: the llmstxt.org v2 proposal (Jeremy Howard, published 2024-09-03, modified 2026-08-10), pasted into the interview.

Recommended Answer:
- H1 title — `^#\s+\S` on the first non-BOM line. The v2 spec calls it "the only required section".
- Blockquote summary — `^>\s+\S`. Evidence only; a missing summary is a quality nit, not a stub.
- At least one file-list link — `^\s*-\s*\[.+?\]\(.+?\)` under an `^## ` heading. This is the payload: where the detail actually lives.
- `pass` = H1 **and** at least one link. `warn` = present but missing either, which is the stub case — an H1 with nothing behind it.

Answer: Sounds good.

Decision: `provenance.llms_txt` passes on an H1 plus at least one file-list link, and warns otherwise. The blockquote summary is recorded in evidence and never changes the verdict.

Reason: All three conditions are taken from the v2 format section and are regex-measurable, so the verdict is pinned to the published spec rather than to a guess about length.

Constraints:
- Treat `llms-full.txt` as neither a criterion nor evidence: v2 does not define it.

### L5

Status: current

Question: Should `security.txt` be checked — present at `/.well-known/security.txt` with a `Contact:` line and an unexpired `Expires:`?

Recommended Answer:
- Keep it, scoped as above, while acknowledging the claim is thinner than `llms.txt`'s: a reading agent never consults `security.txt`, which is an address for security researchers. The product spec's real claim is "machine-readable contact", and this is the only conventional one.

Answer: Let us cut it. Not sure it is relevant for our project.

Decision: Section G does not check `security.txt`. Section G is one check.

Reason: The audited consumer is a reading agent, and no reading agent fetches `security.txt`. Measuring it would widen the dimension without serving the tool's stated consumer.

Negative Requirements:
- Do not fetch `/.well-known/security.txt` or `/security.txt`.

### L6

Status: current

Question: With one check left, does provenance survive as a dimension, or does `llms.txt` move into access as `access.llms_txt` beside `sitemap_present`?

Recommended Answer:
- Keep provenance as its own dimension and its own `section-g/`, with one criterion, reported as an observations block rather than a dimension score.

Answer: Yes, let us keep it.

Decision: The provenance dimension survives with a single criterion, `provenance.llms_txt`, implemented in `scraper/src/section-g/`.

Reason: Access asks "can an agent get the bytes?" and `llms.txt` has no effect on that, so filing it under access would make that dimension mean two things. Keeping provenance also leaves an obvious home for WebMCP or IETF `aipref` if their adoption ever justifies a criterion.

### L7

Status: current

Question: What counts as the file existing, given that a single-page app or a custom 404 page answers `/llms.txt` with HTML at status 200?

Recommended Answer:
- Found only when status is 200, the body is not HTML (`Content-Type` is not `text/html`, and the trimmed body does not start with `<!doctype` or `<html`), and the H1 test passes.
- Anything else warns, with evidence recording which condition failed, so the report can say "/llms.txt returned your 404 page".
- Fetch the site root's `/llms.txt` only, not the subpath files v2 permits.
- Do not fetch `llms-full.txt`.

Answer: Yes, sounds good.

Decision: Presence requires a 200, a non-HTML body and a parsing H1. Only `/llms.txt` at the origin root is fetched.

Reason: The product spec already names this trap for `openapi.json` — "a 200 is not a pass, since a single-page app returns its shell for any path". Subpath `llms.txt` files are worth revisiting once the crawler exists and the audit covers more than one URL.

Negative Requirements:
- Do not treat a 200 as presence on its own.
- Do not fetch any path other than `/llms.txt`.

### L8

Status: current

Question: What does the report say about `llms.txt`, given that the v2 proposal contradicts the product spec's "~10% adoption, Google says it has no effect" positioning note?

Recommended Answer:
- Rulebook entry: `scored: false`, `severity: info`, `effort: S`, `thresholds.min_links: 1`, title "No llms.txt to guide agents to your content".
- `why` states the real adoption picture — thousands of sites, generated automatically by several docs platforms, audited by Lighthouse — and then states that no major AI provider commits to reading one, which is why it is reported and not scored.
- `fix`: "Publish /llms.txt with an H1 title and links to your key pages as markdown".

Answer: Yes, this is fine.

Decision: The rulebook entry is written from the v2 evidence, and the product spec's §3 G positioning note is rewritten to match rather than being copied forward.

Reason: The 2024 positioning note is now wrong on the facts. Repeating it would make the report inaccurate in the one dimension whose entire purpose is not overstating things.
