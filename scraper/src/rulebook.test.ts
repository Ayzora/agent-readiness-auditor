import test from "node:test";
import assert from "node:assert/strict";
import { loadRulebook } from "./rulebook.ts";

const rulebook = loadRulebook();

test("the real rulebook carries a warn credit", () => {
  assert.equal(typeof rulebook.defaults.warn_credit, "number");
});

// Spec 0001 decided a reading agent reads hidden text fine, so it must cost nothing.
test("render.hidden_but_present is unscored and carries no weight", () => {
  const criterion = rulebook.criteria.find((entry) => entry.key === "render.hidden_but_present")!;

  assert.equal(criterion.scored, false);
  assert.equal(criterion.weight, undefined);
});
