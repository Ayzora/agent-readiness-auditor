---
type: Interview Ledger
parent: spec.md
---

## Records

### L1

Status: current

Question: Which of the spec's five Section D (semantics) items should be built?

Recommended Answer:
- Five page-scope checks: `semantics.structured_data_present`, `semantics.structured_data_parses`, `semantics.required_properties`, `semantics.open_graph`, `semantics.date_modified`.
- Not built: full schema.org validation (needs the whole vocabulary), type appropriateness (needs crawler template detection), RDFa.

Answer: Keep the first three. Drop OpenGraph and `dateModified`.

Decision: Section D contains exactly three checks — `semantics.structured_data_present`, `semantics.structured_data_parses` and `semantics.required_properties`. OpenGraph, `dateModified`, full schema.org validation, type appropriateness, microdata and RDFa are all out of scope.

Reason: The three kept checks answer one question each with no overlap — is there structured data, is it readable, is it filled in. OpenGraph is a social-preview fallback that would add a low-weight consolation pass, and `dateModified` plausibility is a narrow check better judged once the tool has real audit data.

Negative Requirements:
- Do not build an OpenGraph check.
- Do not build a `dateModified` check.
- Do not read microdata or RDFa.
- Do not validate against the schema.org vocabulary itself.

### L2

Status: current

Question: If JSON-LD is typically injected by JavaScript, agents such as ChatGPT and Claude never see it — is Section D worth building at all?

Recommended Answer:
- Measured instead of assumed. Raw HTTP fetch, no JavaScript, counting `application/ld+json` blocks: johnlewis.com 2, bbc.co.uk/news 1, stripe.com 1, wikipedia article 1, airbnb.co.uk 1, ikea.com/gb/en 1, ikea product page 3, allbirds product page 2, guardian article 1, bbc article 1; allbirds homepage 0, anthropic.com 0; nytimes.com, argos.co.uk and etsy.com returned 403 to a plain fetch.
- The six zero-block sites were then rendered in Playwright to network idle and recounted: all six still had zero. Not one injected JSON-LD with JavaScript.
- Keep Section D, at moderate weights (4–6) with honest report text.

Answer: Accepted — build Section D.

Decision: Section D is built, weighted moderately rather than critically, and its report text states plainly that search engines and retrieval systems consume structured data while no AI provider publicly commits to it.

Reason: The JS-injection premise did not hold in a twelve-site sample; SEO tooling (Shopify, Yoast, Next.js metadata, CMS templates) emits JSON-LD server-side. The honest residual risk is consumption uncertainty, not visibility — the same positioning the product spec applies to `llms.txt` and WebMCP, one dimension up. Where JS injection does occur, "you have structured data and agents never see it" is exactly the invisible failure this tool exists to surface.

Examples:
- Homepages carry less markup than deep pages: allbirds.co.uk homepage 0 blocks, its product page 2.
- Bot-blocked pages (403) are Section A findings and skip in Section D.

### L3

Status: current

Question: Does Section D judge the raw HTML or the rendered HTML?

Recommended Answer:
- Verdict from `snapshot.rawHtml` only, matching Section C.
- Optionally, when raw has no blocks and `renderedHtml` does, still fail but carry `presentInRenderedOnly: true` and `renderedBlockCount` as evidence, so the report distinguishes "you have none" from "yours is invisible to agents".
- `rawHtml === null` → all three checks `skip` with `reason: "raw fetch failed"`.

Answer: Raw is fine.

Decision: Section D reads `snapshot.rawHtml` only and never reads `snapshot.renderedHtml`, including for evidence. A page whose JSON-LD appears only after JavaScript fails `semantics.structured_data_present`.

Reason: The rule stays flat and identical to Section C — the tool reports what an agent receives, so structured data added client-side cannot earn a pass. L2's measurement showed the rendered-only case did not occur once in twelve sites, so the extra evidence field would carry its own complexity for a case that is rare in practice.

Negative Requirements:
- No Section D check may read `snapshot.renderedHtml`.
- Do not add `presentInRenderedOnly` or `renderedBlockCount` evidence.

### L4

Status: current

Question: Where does the required-properties table live in the rulebook, and what can its property paths express?

Recommended Answer:
- A new `required_properties:` field on the `semantics.required_properties` criterion entry, not a new top-level rulebook section: `Record<string, string[]>` mapping a type name to its required property paths.
- Read through a typed accessor `requiredPropertiesFor(rulebook, CRITERION)` in `utils.ts`, mirroring `thresholdsFor` — a missing key throws rather than returning `undefined`.
- `Criterion` gains `required_properties?: Record<string, string[]>`.
- Path syntax, deliberately tiny: dots walk into nested objects (`offers.price`); `[]` means every item of that array must have it (`mainEntity[].acceptedAnswer`). No wildcards, no alternatives, no conditionals.
- A property counts as present when its value is not `null`, not `""` and not an empty array.
- `offers` may be an object or an array; `offers.price` checks the object, or every member when it is an array, with no extra syntax.
- Starting types: `Product`, `Organization`, `Article`, `NewsArticle`, `BlogPosting`, `FAQPage`, `Event`, `LocalBusiness`.

Answer: Happy with the suggestion.

Decision: The required-properties table is a `required_properties:` field on the criterion entry in `criteria.yaml`, read via a throwing accessor, expressing dotted paths and `[]` array-fanout only, seeded with the eight types above.

Reason: Only this one check reads the table, and keeping it in the criterion entry matches the rulebook's existing "everything governing a criterion is in its entry" shape. A hand-written subset of schema.org will be wrong at the edges and needs updating as real audits arrive; the alternative is shipping and validating the full vocabulary, which is weeks of work to catch mostly the same failures.

### L5

Status: current

Question: What are each check's verdicts, and when does a check skip rather than fail?

Recommended Answer:
- `semantics.structured_data_present`: `rawHtml` null → skip `"raw fetch failed"`; zero blocks → fail; blocks exist but none parses → fail with `blockCount` and `parsedCount: 0`; at least one block parses and names a type → pass.
- `semantics.structured_data_parses`: `rawHtml` null → skip `"raw fetch failed"`; no blocks at all → skip `"no JSON-LD blocks"`; any block fails `JSON.parse`, or parses with no `@type` anywhere → fail, naming the block index and parser message; all blocks parse and name a type → pass.
- `semantics.required_properties`: `rawHtml` null → skip `"raw fetch failed"`; no parseable blocks → skip `"no parseable JSON-LD"`; no declared type is a known type → skip `"no known types declared"`; any known type missing a required property → fail; every known type complete → pass.
- No warn band anywhere in Section D.
- Evidence on `required_properties` names `knownTypes`, `unknownTypes`, `missing` per type, and `complete`.

Answer: Accepted.

Decision: The three checks emit `pass`, `fail` and `skip` only, with the skip reasons above, so one underlying problem is charged once.

Reason: Section D has no continuous measurement like a ratio, so there is no middle state a warn would describe — a price is present or it is not. Failing `structured_data_parses` when there are no blocks would charge a site twice for the absence check 1 already reported, and failing `required_properties` for an uncovered type would punish a site for a hole in our own table, the false-fail the Section C Spec identifies as damaging trust in every other finding.

Negative Requirements:
- No Section D check returns `warn`.
- Do not fail `required_properties` for a type absent from the rulebook table.

### L6

Status: current

Question: What counts as a type declared on a page?

Recommended Answer:
- Entities come from three block shapes, treated alike: a block that is one object, a block that is an array of objects, and a block that is an object holding `@graph: [ … ]`.
- Objects nested inside a property — an `Offer` in `offers`, a `Person` in `author`, a `ContactPoint` in `contactPoint` — are part of their parent and are not entities, though their values are still read by a dotted path.
- `@type` as an array declares every member; a URL form (`http://schema.org/Product`) is reduced to its last segment; otherwise matched exactly and case-sensitively.
- `@context` is not checked at all.
- Several entities of the same type are each judged; the type is complete only if every entity of it is, and evidence records the counts.

Answer: Happy with the recommendation.

Decision: Entity collection, `@type` normalisation, the no-nesting rule, the unchecked `@context` and per-type entity counting are as recommended.

Reason: Counting nested objects as declared types would make a page appear to declare eight things when it declares one. `@context` varies harmlessly across real sites — John Lewis's two blocks disagree (`http` vs `https`) on otherwise sound markup — so failing on it would be pedantry an agent does not care about. Case-sensitivity is kept because schema.org types are CamelCase and a lowercase `product` is a real mistake.

### L7

Status: current

Question: Which words are canonical for Section D, given the dimension is "semantics" but every check is about JSON-LD?

Recommended Answer:
- Keep `semantics` as the dimension name; it is fixed by the product spec's seven and states the question being asked.
- Add to `GLOSSARY.md`: **Structured data**, **JSON-LD block**, **Entity**, **Declared type**, **Known type**, each with avoided wording.

Answer: Go ahead — written during the interview.

Decision: The five terms are in `GLOSSARY.md`, appended to the existing `## Terminology` list. The Spec, rulebook prose and code use them.

Reason: "Entity" and "known type" carry the two distinctions that would otherwise be paraphrased three different ways — one page declaring one thing versus appearing to declare eight, and a genuine gap versus a hole in our own table.

### L8

Status: current

Question: What weights, severities and report text do the three rulebook entries carry, and does Section D have a gate?

Recommended Answer:
- `semantics.structured_data_present` — weight 6, severity high, effort M.
- `semantics.structured_data_parses` — weight 5, severity high, effort S.
- `semantics.required_properties` — weight 5, severity medium, effort S.
- Report text as drafted in the Spec's Requirements.
- No gate for Section D.

Answer: Accepted.

Decision: The three entries carry the weights, severities, efforts and prose above, and no Section D criterion appears in the rulebook's `gates:` list.

Reason: Within a dimension only relative weights matter, and 6/5/5 says the three are near enough equal with presence slightly ahead. They sit below `structure.link_navigation` (7) and `render.text_coverage` (9), which is the honest ordering — a page an agent cannot read at all is worse than one it can read but must infer from. Missing structured data degrades an agent's experience without blocking it, so it should not cap a score.

### L9

Status: current

Question: Should Section D follow Sections B and C for wiring, share one parse helper, and carry tests?

Recommended Answer:
- `scraper/src/section-d/index.ts` exports `runSectionDAudit(snapshot, rulebook): Finding[]`, synchronous so it cannot fetch; `section-d/` holds pure checks only; the root `index.ts` imports that one function and prints with `printFindings("Section D — semantics", …)` after Section C.
- One shared pure helper inside `section-d/` parses blocks and collects entities, so all three checks agree on what is on the page. It stays in `section-d/` rather than beside `page-snapshot.ts`, because unlike the capture layer no other section needs it.
- Tests follow Section C's pattern: inline HTML fixtures, the real rulebook via `loadRulebook()`, no network.

Answer: Accepted by proceeding to Spec creation with the defaults stated and unchallenged.

Decision: Section D's wiring, its internal shared parse helper, and its test approach are as recommended.

Reason: The synchronous signature is what enforces the Phase 1 / Phase 2 split structurally — a function that cannot `await` cannot fetch — and is the same reason `runSectionBAudit` and `runSectionCAudit` are synchronous.
