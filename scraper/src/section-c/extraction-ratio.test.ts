import { snapshotFrom } from "../utils.ts";
import { extractionRatio } from "./extraction-ratio.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { loadRulebook } from "../rulebook.ts";
import { readFileSync } from "node:fs";
import type { FindingStatus } from "../types.ts";

const rulebook = loadRulebook();
const fixturesPath = new URL("./fixtures/", import.meta.url);

const fixtureCases: { file: string; expected: FindingStatus }[] = [
  { file: "content-heavy.html", expected: "pass" },
  { file: "chrome-heavy.html", expected: "fail" },
];

for (const { file, expected } of fixtureCases) {
  test(`Extraction ratio test, with path ${file}`, () => {
    const html = readFileSync(new URL(file, fixturesPath), "utf-8");
    const extractionRatioFinding = extractionRatio(snapshotFrom(html), rulebook);

    assert.equal(extractionRatioFinding.status, expected);
  });
}

test("fails with a null ratio when the raw HTML has no text", () => {
  const html = readFileSync(new URL("no-text.html", fixturesPath), "utf-8");
  const extractionRatioFinding = extractionRatio(snapshotFrom(html), rulebook);

  assert.equal(extractionRatioFinding.status, "fail");
  assert.equal(extractionRatioFinding.evidence.ratio, null);
});

// rawHTMl null test
test("returns skip when HTML is null", () => {
  const emptySnapshot = snapshotFrom(null);
  const extractionRatioFinding = extractionRatio(emptySnapshot, rulebook);

  assert.equal(extractionRatioFinding.status, "skip");
  assert.equal(extractionRatioFinding.evidence.reason, "raw fetch failed");
});
