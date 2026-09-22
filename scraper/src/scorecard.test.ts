import test from "node:test";
import assert from "node:assert/strict";
import { findingFrom, rulebookFrom } from "./utils.ts";
import { loadRulebook } from "./rulebook.ts";
import { scoreFindings } from "./scorecard.ts";
import type { Finding, Gate, Rulebook, Scorecard } from "./types.ts";

// Round weights, so every expected value below is checkable by hand.
const ACCESS = { key: "access.a", weight: 10 };
const RENDER_A = { key: "render.a", weight: 10 };
const RENDER_B = { key: "render.b", weight: 10 };
const STRUCTURE = { key: "structure.a", weight: 10 };
const OBSERVED = { key: "provenance.a", scored: false };

const rulebook = rulebookFrom([ACCESS, RENDER_A, RENDER_B, STRUCTURE, OBSERVED]);

const pass = (criterionKey: string, url?: string): Finding =>
  findingFrom({ criterionKey, status: "pass", ...(url ? { url } : {}) });
const warn = (criterionKey: string, url?: string): Finding =>
  findingFrom({ criterionKey, status: "warn", ...(url ? { url } : {}) });
const fail = (criterionKey: string, url?: string): Finding =>
  findingFrom({ criterionKey, status: "fail", ...(url ? { url } : {}) });
const skip = (criterionKey: string): Finding => findingFrom({ criterionKey, status: "skip" });

const scoreOf = (scorecard: Scorecard, dimension: string): number | null | undefined =>
  scorecard.dimensions.find((entry) => entry.dimension === dimension)?.score;

const renderScoreCases: { name: string; findings: Finding[]; rulebook?: Rulebook; score: number | null }[] = [
  {
    name: "a pass and a fail on equal weights score 50",
    findings: [pass("render.a"), fail("render.b")],
    score: 50,
  },
  {
    name: "a warn earns half the weight at the default warn credit",
    findings: [pass("render.a"), warn("render.b")],
    score: 75,
  },
  {
    name: "a warn earns what the rulebook's warn credit says",
    findings: [pass("render.a"), warn("render.b")],
    rulebook: rulebookFrom([ACCESS, RENDER_A, RENDER_B], { warn_credit: 0.2 }),
    score: 60,
  },
  {
    name: "a skip adds to neither side",
    findings: [pass("render.a"), skip("render.b")],
    score: 100,
  },
  {
    name: "an unscored criterion adds to neither side, whatever its status",
    findings: [pass("render.a"), fail("render.hidden")],
    rulebook: rulebookFrom([ACCESS, RENDER_A, { key: "render.hidden", scored: false }]),
    score: 100,
  },
  {
    name: "a dimension with only skips is N/A, not 0",
    findings: [skip("render.a"), skip("render.b")],
    score: null,
  },
  {
    name: "a dimension with no findings is N/A, not 0",
    findings: [pass("access.a")],
    score: null,
  },
];

for (const { name, findings, rulebook: book, score } of renderScoreCases) {
  test(name, () => {
    assert.equal(scoreOf(scoreFindings(findings, book ?? rulebook), "render"), score);
  });
}

test("dimensions follow the product spec's order and leave out dimensions with no criteria", () => {
  const scorecard = scoreFindings([], rulebookFrom([OBSERVED, STRUCTURE, RENDER_A, ACCESS]));

  assert.deepEqual(
    scorecard.dimensions.map((entry) => entry.dimension),
    ["access", "render", "structure", "provenance"],
  );
});

test("a dimension whose criteria are all unscored is observational and has no score", () => {
  const scorecard = scoreFindings([pass("access.a"), pass("provenance.a")], rulebook);
  const provenance = scorecard.dimensions.find((entry) => entry.dimension === "provenance")!;

  assert.equal(provenance.observational, true);
  assert.equal(provenance.score, null);
});

test("the total is the mean of dimension scores, so a dimension counts once however many findings it holds", () => {
  const findings = [
    fail("access.a"),
    ...Array.from({ length: 9 }, (_, index) => pass("render.a", `https://test.invalid/${index}`)),
  ];

  // Pooled, this would be 90 of 100 = 90. Averaged, it is (0 + 100) ÷ 2.
  assert.equal(scoreFindings(findings, rulebook).total, 50);
});

test("the total is computed from unrounded dimension scores", () => {
  const book = rulebookFrom([
    { key: "access.a", weight: 1 },
    { key: "access.b", weight: 1 },
    { key: "render.a", weight: 1 },
    { key: "render.b", weight: 7 },
  ]);
  const findings = [pass("access.a"), fail("access.b"), pass("render.a"), fail("render.b")];

  // Access 50, render 12.5: unrounded, the mean is 31.25 → 31. Rounding the
  // dimensions first would give 50 and 13, a mean of 31.5 → 32.
  assert.equal(scoreFindings(findings, book).total, 31);
});

test("an N/A dimension is left out of the total and named", () => {
  const scorecard = scoreFindings([pass("access.a"), fail("structure.a")], rulebook);

  assert.equal(scorecard.total, 50);
  assert.deepEqual(scorecard.leftOut, ["render"]);
});

test("an observational dimension is never named as left out of the total", () => {
  const scorecard = scoreFindings([pass("access.a"), pass("render.a"), pass("structure.a")], rulebook);

  assert.deepEqual(scorecard.leftOut, []);
});

test("no total is computed when access is N/A, and the reason is recorded", () => {
  const scorecard = scoreFindings([pass("render.a"), pass("structure.a")], rulebook);

  assert.equal(scorecard.total, null);
  assert.equal(scorecard.uncappedTotal, null);
  assert.equal(scorecard.withheld, "access-not-measured");
});

const GATE_20: Gate = { criterion: "access.a", cap: 20, reason: "blocks everything" };
const GATE_25: Gate = { criterion: "access.b", cap: 25, reason: "blocks the rest" };
const gated = rulebookFrom([ACCESS, { key: "access.b", weight: 10 }, RENDER_A], {
  gates: [GATE_20, GATE_25],
});

const gateCases: { name: string; findings: Finding[]; fired: string[]; total: number; uncapped: number }[] = [
  {
    name: "a gate fires when every finding for its criterion fails",
    findings: [fail("access.a", "https://test.invalid/1"), fail("access.a", "https://test.invalid/2"), pass("access.b"), pass("render.a")],
    fired: ["access.a"],
    total: 20,
    uncapped: 67,
  },
  {
    name: "a gate does not fire when one of its findings passes",
    findings: [fail("access.a", "https://test.invalid/1"), pass("access.a", "https://test.invalid/2"), pass("access.b"), pass("render.a")],
    fired: [],
    total: 83,
    uncapped: 83,
  },
  {
    name: "a gate does not fire when one of its findings warns",
    findings: [fail("access.a", "https://test.invalid/1"), warn("access.a", "https://test.invalid/2"), pass("access.b"), pass("render.a")],
    fired: [],
    total: 75,
    uncapped: 75,
  },
  {
    name: "a gate with no findings does not fire",
    findings: [pass("access.b"), pass("render.a")],
    fired: [],
    total: 100,
    uncapped: 100,
  },
  {
    name: "two gates fire: the lower cap applies and both are listed",
    findings: [fail("access.a"), fail("access.b"), pass("render.a")],
    fired: ["access.a", "access.b"],
    total: 20,
    uncapped: 50,
  },
  {
    name: "a gate whose cap is above the total fires without lowering it",
    findings: [fail("access.b"), warn("access.a"), fail("render.a")],
    fired: ["access.b"],
    total: 13,
    uncapped: 13,
  },
];

for (const { name, findings, fired, total, uncapped } of gateCases) {
  test(name, () => {
    const scorecard = scoreFindings(findings, gated);

    assert.deepEqual(
      scorecard.gates.map((gate) => gate.criterion),
      fired,
    );
    assert.equal(scorecard.total, total);
    assert.equal(scorecard.uncappedTotal, uncapped);
  });
}

test("a gate never changes a dimension score", () => {
  const scorecard = scoreFindings([fail("access.a"), pass("access.b"), pass("render.a")], gated);

  assert.equal(scoreOf(scorecard, "access"), 50);
  assert.equal(scoreOf(scorecard, "render"), 100);
});

test("scoring does not modify the findings", () => {
  const findings = [pass("access.a"), warn("render.a")];
  const before = structuredClone(findings);

  scoreFindings(findings, rulebook);

  assert.deepEqual(findings, before);
});

test("a finding whose key is not in the rulebook throws and names it", () => {
  assert.throws(() => scoreFindings([pass("render.typo")], rulebook), /render\.typo/);
});

const fixFirstBook = rulebookFrom([
  { key: "access.a", weight: 10, effort: "S" },
  { key: "render.big", weight: 9, effort: "L" },
  { key: "render.cheap", weight: 4, effort: "S" },
  { key: "render.tie_low", weight: 3, effort: "S" },
  { key: "render.tie_high", weight: 6, effort: "M" },
  { key: "render.skipped", weight: 10, effort: "S" },
  { key: "render.passing", weight: 10, effort: "S" },
  { key: "render.hidden", scored: false, effort: "S" },
  { key: "structure.b", weight: 6, effort: "M" },
]);

test("Fix first groups by criterion, lists the subjects that cost points, and sorts by ROI", () => {
  const scorecard = scoreFindings(
    [
      pass("access.a"),
      // 9 × 2 ÷ 6 = 3
      fail("render.big", "https://test.invalid/pricing"),
      fail("render.big", "https://test.invalid/docs"),
      pass("render.big", "https://test.invalid/"),
      // 4 × 1 ÷ 1 = 4
      warn("render.cheap", "https://test.invalid/docs"),
      // 3 × 1 ÷ 1 = 3, tied with big on ROI: big's higher weight goes first
      warn("render.tie_low"),
      // 6 × 1 ÷ 3 = 2, tied with structure.b on ROI and weight: alphabetical
      fail("render.tie_high"),
      fail("structure.b"),
      skip("render.skipped"),
      pass("render.passing"),
      fail("render.hidden"),
    ],
    fixFirstBook,
  );

  assert.deepEqual(
    scorecard.fixFirst.map(({ criterionKey, subjects, roi }) => ({ criterionKey, subjects, roi })),
    [
      { criterionKey: "render.cheap", subjects: ["https://test.invalid/docs"], roi: 4 },
      {
        criterionKey: "render.big",
        subjects: ["https://test.invalid/pricing", "https://test.invalid/docs"],
        roi: 3,
      },
      { criterionKey: "render.tie_low", subjects: ["https://test.invalid/page"], roi: 3 },
      { criterionKey: "render.tie_high", subjects: ["https://test.invalid/page"], roi: 2 },
      { criterionKey: "structure.b", subjects: ["https://test.invalid/page"], roi: 2 },
    ],
  );
});

test("Fix first is empty when nothing costs points", () => {
  const scorecard = scoreFindings([pass("access.a"), skip("render.a"), fail("provenance.a")], rulebook);

  assert.deepEqual(scorecard.fixFirst, []);
});

// Shape only, never an exact score: this catches the real rulebook drifting
// out of step with the scorer without making every weight change look like a bug.
test("the real rulebook scores a run spanning every dimension", () => {
  const real = loadRulebook();
  const findings: Finding[] = [
    pass("access.robots_allows_agents"),
    warn("access.policy_divergence"),
    fail("access.baseline_mismatch"),
    pass("render.text_coverage"),
    warn("render.hidden_but_present"),
    fail("render.images_missing_alt"),
    pass("structure.extraction_ratio"),
    fail("structure.link_navigation"),
    pass("semantics.structured_data_present"),
    skip("semantics.required_properties"),
    fail("documents.reachable", "https://test.invalid/files/a.pdf"),
    warn("provenance.llms_txt"),
  ];

  const scorecard = scoreFindings(findings, real);

  assert.deepEqual(
    scorecard.dimensions.map((entry) => entry.dimension),
    ["access", "render", "structure", "semantics", "documents", "provenance"],
  );
  assert.equal(scorecard.dimensions.at(-1)!.observational, true);
  assert.ok(scorecard.total !== null && scorecard.total >= 0 && scorecard.total <= 100);
  assert.ok(!scorecard.fixFirst.some((entry) => entry.criterionKey === "render.hidden_but_present"));
});
