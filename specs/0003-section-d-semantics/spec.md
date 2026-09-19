---
type: Spec
title: "Section D (semantics): JSON-LD structured data checks"
---

## Problem

Sections A, B and C answer whether an agent can fetch a page, whether its content exists without JavaScript, and whether the raw HTML is shaped so the content can be read and navigated. Nothing yet answers the question the product spec's §3 D asks: once an agent has the text, are the page's **facts** declared anywhere machine-readably, or must every one of them be inferred from prose?

A page can be perfectly readable and still force an agent to guess. "Is this in stock?", "what does it cost?", "who published this and when?", "is this Facebook account really theirs?" are all answerable from a `<script type="application/ld+json">` block in the HTML, and unanswerable without one except by inference the agent cannot cite.

The product spec's §3 D list names five items, and two are far larger than they appear. Validating against schema.org means shipping and maintaining the vocabulary. Type appropriateness — "is this product page typed only `WebPage`?" — needs the page-template detection that the crawler's structural clustering will provide, and the crawler does not exist yet.

A reasonable objection was raised and tested during the interview: if JSON-LD is typically injected by JavaScript, the agents this tool cares about never see it and the dimension is worthless. Measurement did not support the premise. Across twelve sites fetched raw with no JavaScript, ten carried JSON-LD in the bytes (johnlewis.com 2 blocks, ikea product page 3, allbirds product page 2, bbc.co.uk/news, stripe.com, wikipedia, airbnb.co.uk, ikea homepage, a Guardian article and a BBC article 1 each); of the sites with none, three were 403 bot blocks and the remaining three still had zero after a full Playwright render to network idle. Not one site in the sample injected structured data with JavaScript. [L2]

## Proposed Outcome

A `scraper/src/section-d/` folder of pure check functions over the existing `PageSnapshot`, emitting three findings per page — `semantics.structured_data_present`, `semantics.structured_data_parses` and `semantics.required_properties` — judged on the **raw** HTML an agent actually receives, with the per-type property table held in `criteria.yaml`.

Running `pnpm scraper <url>` prints a Section D block after Section C. Section D adds tests in Section C's established pattern and adds no capture work.

## User Stories

1. As a site owner, I want to be told when my pages carry no machine-readable facts at all, so I know an agent is inferring everything about my business from prose.
2. As a site owner, I want to be told when the structured data I already ship is broken, because a block that does not parse is discarded whole and the effort spent writing it is wasted.
3. As a site owner, I want to know which specific properties my structured data is missing — named, per type — so the fix is a concrete edit rather than a research project.
4. As a site owner, I want Section D to judge the HTML agents actually receive, so structured data that only appears after JavaScript is not reported as a pass.
5. As a site owner, I do not want to be marked down for using a legitimate schema.org type this tool has no opinion about yet.
6. As a site owner, I want Section D's report text to be honest about how much structured data is known to be consumed by AI systems, so I can weigh the fix against the others in the queue.
7. As a developer of this tool, I want Section D's verdicts pinned by tests over small inline HTML fixtures, so the awkward shapes — `@graph`, `@type` arrays, nested entities, broken JSON — are verified without hunting for a real site exhibiting each one.

## Requirements

### Scope

1. Section D contains exactly three checks: `semantics.structured_data_present`, `semantics.structured_data_parses` and `semantics.required_properties`. [L1]
2. The following are **not** built: an OpenGraph check, a `dateModified` check, validation against the schema.org vocabulary, type appropriateness (declared type versus detected page template), microdata and RDFa. [L1]
3. `agent-readiness-auditor-spec.md` §3 D is updated to list only the three checks, state that they read raw HTML, and record the cut items with their reasons. [L1] [L2]
4. Section D is built at moderate weight with report text that states plainly that search engines and retrieval systems consume structured data today while no AI provider publicly commits to parsing schema.org. [L2] [L8]

### Input

5. All three checks read `snapshot.rawHtml` only. [L3]
6. No Section D check reads `snapshot.renderedHtml`, for a verdict or for evidence. A page whose JSON-LD appears only after JavaScript fails `semantics.structured_data_present`. [L3]
7. When `snapshot.rawHtml` is `null`, all three checks return `skip` with evidence `reason: "raw fetch failed"`, matching Section C. [L3] [L5]
8. Section D adds no capture work: no change to `page-snapshot.ts`, `interaction-probe.ts` or `PageSnapshot`. [L9]

### Shared parsing and entity collection

9. One pure helper inside `section-d/` parses the page's JSON-LD blocks and collects its entities, and all three checks read its result, so no two checks can disagree about what the page declares. [L9]
10. Blocks are the page's `<script type="application/ld+json">` elements, matched on the `type` attribute case-insensitively and ignoring surrounding whitespace, parsed from the raw HTML with `linkedom` as elsewhere in the scraper. [L6]
11. A block's text content is parsed with `JSON.parse`. A block that throws is recorded as a parse failure with its zero-based index and the parser's message. [L5] [L6]
12. **Entities** are collected from three block shapes, treated alike: a block whose JSON is one object, a block whose JSON is an array of objects, and a block whose JSON is an object holding `"@graph": [ … ]`. An entity is a member of one of those shapes carrying an `@type`. [L6]
13. Objects nested inside a property are **not** entities — an `Offer` inside `offers`, a `Person` inside `author`, a `ContactPoint` inside `contactPoint`. Their values are still read when a required-property path walks into them. [L6]
14. A block that parses to a value which yields no entities — a string, a number, `null`, an empty array, or objects with no `@type` — contributes zero entities. [L5] [L6]
15. `@type` normalisation: an array declares every member; a value in URL form (`http://schema.org/Product`, `https://schema.org/Product`) is reduced to its last path segment; any other value is used as written. [L6]
16. Declared types are matched against the rulebook table exactly and case-sensitively, so a lowercase `product` does not match `Product`. [L6]
17. `@context` is not inspected and never affects a verdict. [L6]

### `semantics.structured_data_present`

18. Verdicts, in order: [L5]
    - `rawHtml` is `null` → `skip`, `reason: "raw fetch failed"`.
    - no JSON-LD blocks in the page → `fail`.
    - blocks exist but none of them yields an entity → `fail`.
    - at least one block parses and yields an entity → `pass`.
19. Evidence on every non-skip finding: `blockCount`, `parsedCount` (blocks that parsed), `entityCount`, and `declaredTypes` (the distinct normalised types found). [L5] [L6]

### `semantics.structured_data_parses`

20. Verdicts, in order: [L5]
    - `rawHtml` is `null` → `skip`, `reason: "raw fetch failed"`.
    - no JSON-LD blocks at all → `skip`, `reason: "no JSON-LD blocks"`. The absence is `semantics.structured_data_present`'s finding, and failing here would charge the page twice for one problem.
    - any block fails `JSON.parse`, or parses but yields no entity → `fail`.
    - every block parses and yields at least one entity → `pass`.
21. Evidence: `blockCount`, `parsedCount`, and `parseErrors` — one entry per broken block with its zero-based `index` and the parser's `message`. A block that parsed but yielded no entity is reported with a `message` saying no `@type` was found rather than a parser message. [L5]

### `semantics.required_properties`

22. Verdicts, in order: [L4] [L5]
    - `rawHtml` is `null` → `skip`, `reason: "raw fetch failed"`.
    - no block yielded an entity → `skip`, `reason: "no parseable JSON-LD"`.
    - entities exist but none of their declared types is a **known type** → `skip`, `reason: "no known types declared"`.
    - any known type has at least one entity missing at least one required property → `fail`.
    - every entity of every known type carries all its required properties → `pass`.
23. A **known type** is a declared type with an entry in the criterion's `required_properties` table. An unknown type never costs the page anything. [L4] [L5]
24. Property paths express two things only: a dot walks into a nested object (`offers.price`), and `[]` means every member of that array must satisfy the rest of the path (`mainEntity[].acceptedAnswer`). No wildcards, no alternatives, no conditionals. [L4]
25. A property counts as **present** when the value at its path exists and is not `null`, not the empty string, and not an empty array. A missing intermediate object makes the property absent. [L4]
26. An array position that holds an empty array satisfies nothing: `mainEntity[].acceptedAnswer` against `"mainEntity": []` counts the property as absent. [L4]
27. A path segment whose value may be either an object or an array is handled without extra syntax: `offers.price` checks the object, or every member when `offers` is an array, and is present only if every member has it. Real sites emit both shapes and schema.org permits both. [L4]
28. Several entities of the same type are each judged. The type is complete only when every entity of it is complete. [L6]
29. Evidence: [L5] [L6]
    - `knownTypes` — the known types found on the page.
    - `unknownTypes` — declared types with no rulebook entry.
    - `missing` — per known type, the entity count, how many were incomplete, and the distinct property paths found missing.
    - `complete` — the known types with nothing missing.

    For example: `{ knownTypes: ["Product", "Organization"], unknownTypes: ["BreadcrumbList"], missing: { Product: { entities: 12, incomplete: 3, properties: ["offers.price"] } }, complete: ["Organization"] }`, so the report can name the missing property rather than reporting "semantics: fail".

### Verdict statuses

30. Section D checks return `pass`, `fail` or `skip` only. No Section D check returns `warn`, because none of them measures a continuous quantity with a meaningful middle state. [L5]
31. Every `skip` carries a distinct `reason` in its evidence, as elsewhere in the scraper. [L5]

### Rulebook

32. `criteria.yaml` gains one entry per new key, `dimension: semantics`, `scope: page`, following the existing entry shape. [L8]
33. No Section D criterion carries `thresholds:`, and no Section D check calls `thresholdsFor`. Section D has no cutoff numbers. [L4]
34. `semantics.required_properties` carries a new `required_properties:` field — a map from type name to a list of required property paths — on its own criterion entry, rather than in a new top-level rulebook section. [L4]
35. `Criterion` in `types.ts` gains `required_properties?: Record<string, string[]>`. [L4]
36. `utils.ts` gains `requiredPropertiesFor(rulebook, criterionKey)`, mirroring `thresholdsFor`: it throws when the criterion has no table and when a type is read that the table does not define, so a rename in the rulebook fails loudly instead of silently comparing against `undefined`. [L4]
37. The table's starting types and paths: [L4]

    ```yaml
    required_properties:
      Product:       [name, offers.price, offers.availability]
      Organization:  [name, url, sameAs]
      Article:       [headline, datePublished, author]
      NewsArticle:   [headline, datePublished, author]
      BlogPosting:   [headline, datePublished, author]
      FAQPage:       ["mainEntity[].name", "mainEntity[].acceptedAnswer"]
      Event:         [name, startDate, location]
      LocalBusiness: [name, address, telephone]
    ```

38. Weights, severities, efforts and report text: [L8]
    - `semantics.structured_data_present` — weight 6, severity high, effort M. Title: "No machine-readable facts about this page". Why: agents read a page's structured data before its prose, because it states the facts plainly — what this page is, what it costs, who published it — with no inference; without it every fact must be guessed from the text; search engines and retrieval systems read this data today, and no AI provider publicly commits to it, which is why this is weighted moderately rather than as a critical failure. Fix: "Add a JSON-LD block to the page's HTML describing what the page is".
    - `semantics.structured_data_parses` — weight 5, severity high, effort S. Title: "Structured data is present but broken". Why: a block that is not valid JSON is discarded whole by every reader, so markup that was written, shipped and maintained delivers nothing. Fix: "Fix the JSON syntax error so the block parses".
    - `semantics.required_properties` — weight 5, severity medium, effort S. Title: "Structured data is declared but not filled in". Why: a type with no properties tells an agent what kind of thing the page is but none of the facts about it, so a `Product` with no price and no availability leaves the agent doing exactly the guesswork the markup was meant to remove. Fix: "Add the missing properties named in this report to each entity".
39. No Section D criterion is added to the rulebook's `gates:` list. Missing structured data degrades an agent's experience without blocking it, so it must not cap a score. [L8]

### Wiring and output

40. `scraper/src/section-d/index.ts` exports `runSectionDAudit(snapshot: PageSnapshot, rulebook: Rulebook): Finding[]`. **The function is synchronous**, for the same reason as `runSectionBAudit` and `runSectionCAudit`: a function that cannot `await` cannot fetch. [L9]
41. `section-d/` contains only pure check functions and the shared parse helper, and no network code. [L9]
42. The root `scraper/src/index.ts` imports only `runSectionDAudit`, passes it the snapshot it already captured and the loaded rulebook, and prints the result with `printFindings("Section D — semantics", …)` after Section C. [L9]
43. Criterion keys use the dimension, never the section folder: `semantics.*`, never `section-d.*`. [L7]
44. `CLAUDE.md` gains a Section D description alongside A, B and C, and its `pnpm scraper` row mentions Section D. [L9]

### Tests

45. Test files live beside the code as `scraper/src/section-d/*.test.ts`, run by the existing `pnpm --filter scraper test` script. No new test dependency. [L9]
46. Each test builds a `PageSnapshot` with `snapshotFrom(rawHtml)` from `utils.ts`, loads the real rulebook with `loadRulebook()`, calls a check, and asserts on `status` and evidence. No network, no browser. [L9]
47. Required cases: [L9]
    - no JSON-LD blocks → `structured_data_present` fails, `structured_data_parses` skips with `"no JSON-LD blocks"`, `required_properties` skips with `"no parseable JSON-LD"`.
    - a valid `Product` with `name`, `offers.price` and `offers.availability` → all three pass.
    - a `Product` missing `offers.availability` → `required_properties` fails and its evidence names `offers.availability`.
    - a block with broken JSON → `structured_data_parses` fails with the block index; with no other block present, `structured_data_present` fails too.
    - one block holding `@graph` with three entities → all three counted.
    - a block whose only objects lack `@type` → `structured_data_parses` fails; `structured_data_present` fails.
    - a nested `Offer` inside a `Product` is not counted as an entity, and `Offer` does not appear in `declaredTypes`.
    - `"@type": ["Product", "Vehicle"]` declares both; `"@type": "https://schema.org/Product"` matches `Product`.
    - a page declaring only `BreadcrumbList` → `required_properties` skips with `"no known types declared"` and reports it in `unknownTypes`.
    - a `FAQPage` whose `mainEntity` array has one question with no `acceptedAnswer` → fails; an empty `mainEntity` array → fails.
    - two `Product` entities where one is incomplete → fails, with `entities: 2` and `incomplete: 1`.
    - `rawHtml: null` → all three skip with `"raw fetch failed"`.
48. A test file drives off a written list of expectations rather than a directory listing, and nothing in a test catches what a check throws. [L9]

## Technical Decisions

- **Raw HTML only, no rendered fallback and no rendered evidence** [L3]. The tool reports what an agent receives, so structured data added client-side cannot earn a pass. The rejected alternative — failing on raw but carrying `presentInRenderedOnly` evidence so the report could distinguish "you have none" from "yours is invisible" — was dropped because L2's measurement found no site in twelve doing it, which makes the extra field complexity without a case.
- **Build Section D, at moderate weight, with honest prose** [L2]. The JS-injection objection was tested and did not hold. The residual risk is consumption uncertainty — no AI provider publicly commits to parsing schema.org — which is a reason to weight it at 5–6 and say so in the report, the same treatment the product spec gives `llms.txt` and WebMCP.
- **A hand-written property table, not schema.org validation** [L4]. Eight types cover the page kinds that carry commercial facts, and the check the product spec calls "cheap to check, most sites fail". The table will be wrong at the edges and is expected to change as real audits arrive; shipping and validating the full vocabulary is weeks of work for mostly the same findings.
- **The table lives on the criterion entry** [L4]. Only this check reads it, and the rulebook's existing shape keeps everything governing a criterion inside its entry. If type appropriateness later wants the same table, promoting it to a top-level section is a small move.
- **A throwing accessor, not optional chaining** [L4]. `requiredPropertiesFor` follows `thresholdsFor` exactly: a missing key or type is a loud failure, because a silently `undefined` table would make every page pass.
- **Skip rather than fail for uncovered types** [L5]. A page using a legitimate type we have not written down is not a defective page. The Section C Spec's reasoning applies — a false fail damages trust in every other finding.
- **No warn band** [L5]. Sections B and C warn because they measure ratios with a genuine middle state. Section D's questions are binary, and inventing a warn band would mean inventing a rule for it.
- **Nested objects are not entities** [L6]. Counting them would make a page with one `Product` appear to declare four types, and would put `Offer` and `Person` in front of the site owner as though they were page-level claims.
- **`@context` unchecked** [L6]. Real sites vary the value harmlessly — John Lewis's two blocks disagree (`http` versus `https`) on otherwise sound markup — and no agent cares.
- **One shared parse helper, inside `section-d/`** [L9]. All three checks must agree on what the page declares. It stays inside the section folder rather than beside `page-snapshot.ts` because, unlike the capture layer, no other section needs it — the reverse of the reasoning that put `soft-404-probe.ts` outside `section-b/`.

## Testing Strategy

The Test Seam is the existing one, unchanged: check functions are synchronous and pure over a `PageSnapshot` and a `Rulebook`. Tests build a snapshot with `snapshotFrom(rawHtml)`, load the real `criteria.yaml` through `loadRulebook()`, and assert on the returned `Finding`. No network, browser, or fake of either. [L9]

Using the real rulebook means a type renamed or removed from `required_properties` but still referenced in code fails the tests loudly through `requiredPropertiesFor`. Fixtures should assert on named missing properties rather than on counts that a table edit would shift. [L4] [L9]

Section D's fixtures are inline HTML strings rather than files: each one is a few lines of `<script type="application/ld+json">`, and the awkward shapes (`@graph`, `@type` arrays, URL-form types, broken JSON, nested entities) read better beside the assertion than in a separate file. [L9]

Manual verification: run `pnpm scraper <url>` against a page with sound markup (`https://www.johnlewis.com`), a product page (`https://www.ikea.com/gb/en/p/…`), and a page with none (`https://www.anthropic.com`), and confirm the Section D block prints the expected verdicts. `pnpm lint` must pass. [L2]

## Out of Scope

- An OpenGraph check (`og:title`, `og:description`, `og:type`, `og:image`). [L1]
- A `dateModified` presence-and-plausibility check. [L1]
- Validating declared types and properties against the schema.org vocabulary. [L1]
- Type appropriateness — comparing the declared type against a detected page template. It needs the crawler's structural clustering, which does not exist. [L1]
- Microdata and RDFa. [L1]
- Reading `snapshot.renderedHtml` anywhere in Section D. [L3]
- Any Section D gate. [L8]
- Scoring, gates and dimension scores — build step 3; Section D only emits findings.
- Crawling multiple pages and per-template sampling — build step 4.
- Tests for Sections A and B.

## Open Questions

- **A page with several known types, one incomplete.** Requirement 22 fails the page when any known type is incomplete, even if four others are complete. The evidence names exactly which, so the report stays actionable, but the alternative — failing only when every known type is incomplete — would be more forgiving of a site whose main entity is sound and whose secondary markup is thin. Revisit once real audits show how often the mixed case occurs. [L5]
- **Which types the table should cover.** The eight in Requirement 37 are a starting guess. Real audits will show which types actually appear and which required properties are genuinely load-bearing versus pedantic. [L4]
- **Starting weights and report text.** Requirement 38's values are first guesses, to be tuned once real audits exist — the same status as Section C's weights. [L8]
- **Whether the property table should be promoted.** If type appropriateness lands and wants the same type list, `required_properties` may be better as a shared top-level rulebook section than a criterion field. [L4]

## Follow-Ups

- **Type appropriateness**, once the crawler's template clustering exists: a product page typed only `WebPage` is a real finding, and the product spec names it. It needs a detected page template to compare the declared type against. [L1]
- **Microdata and RDFa**, if audits show sites relying on them. The current decision is that JSON-LD is what tooling emits and what readers consume; nothing in the twelve-site sample contradicted that, but the sample did not look for microdata. [L1]
- **Consumption evidence for the report.** The `why:` text asserts that search engines and retrieval systems read structured data while AI providers do not commit to it. If that changes — a provider documenting schema.org consumption — the weight and the prose should both move. [L2]
