---
type: Work Item
title: Unscored criterion support in the rulebook
parent: ../spec.md
status: done
---

## What to build

Teach the rulebook that a criterion can be measured and reported without carrying weight, and add the `provenance.llms_txt` entry that uses it.

- `Criterion` in `scraper/src/types.ts` gains `scored?: boolean` (absent means true) and `weight` becomes optional.
- The `severity` union gains `"info"`.
- `loadRulebook()` in `scraper/src/rulebook.ts` gains one load-time assertion: every criterion not marked `scored: false` must carry a numeric `weight` greater than zero, throwing and naming the offending key otherwise.
- `scraper/criteria.yaml` gains the `provenance.llms_txt` entry from Requirement 30, verbatim in shape.

## Required context

`weight: 0` was rejected in favour of the explicit `scored: false` flag, because a zero weight is indistinguishable from a forgotten field. The assertion is the point of the flag: it is the only thing standing between a typo and a finding that silently drops out of the arithmetic.

Nothing scores yet, so this Work Item adds the vocabulary and the guard, not any scoring behaviour. `docs/scoring-pipeline.md` already lists load-time key validation as an open decision; this is a narrow first piece of it, not the whole thing.

The assertion throws in the established style of `thresholdsFor` and `requiredPropertiesFor` in `scraper/src/utils.ts` — a missing or wrong value is loud, never `undefined`.

## Acceptance criteria

- [x] `Criterion.scored` is optional and absent means scored.
- [x] `Criterion.weight` is optional; `severity` accepts `"info"`.
- [x] `loadRulebook()` throws, naming the key, for a criterion that is not `scored: false` and has no positive weight.
- [x] `loadRulebook()` does not throw for a criterion marked `scored: false` with no weight.
- [x] `criteria.yaml` carries `provenance.llms_txt` with `dimension: provenance`, `scope: site`, `scored: false`, `severity: info`, `effort: S`, `thresholds.min_links: 1`, and the title/why/fix text from Requirement 30.
- [x] `thresholdsFor(rulebook, "provenance.llms_txt").min_links` returns `1`.
- [ ] A test in the established pattern covers the throwing and non-throwing cases.
      Dropped deliberately: the assertion is module-private and verified by hand.
      The spec's Testing Strategy still asks for it.
- [x] `pnpm lint` and `pnpm --filter scraper test` pass.

## Covers

- User Stories: 4, 5
- Requirements: 7-12, 30, 31
- Testing Strategy: the rulebook assertion test
- Interview Ledger: L2, L8

## Blocked by

None - ready to start
