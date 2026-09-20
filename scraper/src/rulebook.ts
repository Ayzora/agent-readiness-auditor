import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Rulebook } from "./types.ts";

const RULEBOOK_PATH = new URL("../criteria.yaml", import.meta.url);

export function loadRulebook(): Rulebook {
  const rulebook = parse(readFileSync(RULEBOOK_PATH, "utf8")) as Rulebook;
  assertScoredCriteriaHaveWeight(rulebook);

  return rulebook;
}

// A criterion meant to count but carrying no weight would drop silently out
// of the arithmetic, so the load refuses the whole file and names the key.
function assertScoredCriteriaHaveWeight(rulebook: Rulebook): void {
  for (const criterion of rulebook.criteria) {
    if (criterion.scored === false) continue;

    const { weight } = criterion;
    if (weight === undefined || weight <= 0)
      throw new Error(`criteria.yaml: scored criterion ${criterion.key} has no positive weight`);
  }
}
