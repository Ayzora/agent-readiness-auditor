import test from "node:test";
import assert from "node:assert/strict";
import { snapshotFrom } from "../utils.ts";
import { structuredDataPresent, structuredDataParses } from "./structured-data.ts";
import type { FindingStatus } from "../types.ts";

const block = (json: string, type = "application/ld+json") =>
  `<script type="${type}">${json}</script>`;

const PRODUCT = `{"@context":"https://schema.org","@type":"Product","name":"Blue Mug"}`;

// What the page declares, read off structured_data_present's evidence: the entity
// rules matter more than any verdict, because all three checks share them.
const collectionCases: {
  name: string;
  html: string;
  entityCount: number;
  declaredTypes: string[];
}[] = [
  {
    name: "a block holding one object",
    html: block(PRODUCT),
    entityCount: 1,
    declaredTypes: ["Product"],
  },
  {
    name: "a block holding an array of objects",
    html: block(`[{"@type":"Product","name":"A"},{"@type":"Organization","name":"B"}]`),
    entityCount: 2,
    declaredTypes: ["Product", "Organization"],
  },
  {
    name: "a block holding an @graph",
    html: block(
      `{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"A"},{"@type":"WebSite","url":"/"},{"@type":"Product","name":"C"}]}`,
    ),
    entityCount: 3,
    declaredTypes: ["Organization", "WebSite", "Product"],
  },
  {
    name: "two separate blocks",
    html: block(PRODUCT) + block(`{"@type":"Organization","name":"Shop"}`),
    entityCount: 2,
    declaredTypes: ["Product", "Organization"],
  },
  // An Offer inside offers describes part of the Product, not the page.
  {
    name: "an object nested inside a property",
    html: block(`{"@type":"Product","name":"A","offers":{"@type":"Offer","price":"12.00"}}`),
    entityCount: 1,
    declaredTypes: ["Product"],
  },
  {
    name: "an @type array",
    html: block(`{"@type":["Product","Vehicle"],"name":"Van"}`),
    entityCount: 1,
    declaredTypes: ["Product", "Vehicle"],
  },
  {
    name: "an @type in URL form",
    html: block(`{"@type":"https://schema.org/Product","name":"A"}`),
    entityCount: 1,
    declaredTypes: ["Product"],
  },
  // Case matters: a lowercase type is a mistake, not a variation.
  {
    name: "a lowercase @type",
    html: block(`{"@type":"product","name":"A"}`),
    entityCount: 1,
    declaredTypes: ["product"],
  },
  {
    name: "a block whose type attribute is oddly cased and padded",
    html: block(PRODUCT, " Application/LD+JSON "),
    entityCount: 1,
    declaredTypes: ["Product"],
  },
  {
    name: "objects with no @type",
    html: block(`{"name":"A","url":"/a"}`),
    entityCount: 0,
    declaredTypes: [],
  },
  {
    name: "a block holding a bare string",
    html: block(`"hello"`),
    entityCount: 0,
    declaredTypes: [],
  },
];

for (const { name, html, entityCount, declaredTypes } of collectionCases) {
  test(`collects entities from ${name}`, () => {
    const finding = structuredDataPresent(snapshotFrom(html));

    assert.equal(finding.evidence.entityCount, entityCount);
    assert.deepEqual(finding.evidence.declaredTypes, declaredTypes);
  });
}

const presentCases: { name: string; html: string; expected: FindingStatus }[] = [
  { name: "no JSON-LD blocks at all", html: `<p>Just prose.</p>`, expected: "fail" },
  { name: "one valid block", html: block(PRODUCT), expected: "pass" },
  { name: "a block of broken JSON", html: block(`{"@type":"Product",}`), expected: "fail" },
  { name: "a block declaring no type", html: block(`{"name":"A"}`), expected: "fail" },
  // One readable block is enough: the page does declare something.
  {
    name: "one valid block beside a broken one",
    html: block(PRODUCT) + block(`{oops}`),
    expected: "pass",
  },
];

for (const { name, html, expected } of presentCases) {
  test(`structured_data_present with ${name}`, () => {
    assert.equal(structuredDataPresent(snapshotFrom(html)).status, expected);
  });
}

const parsesCases: { name: string; html: string; expected: FindingStatus }[] = [
  // The absence is structured_data_present's finding, not this one's.
  { name: "no JSON-LD blocks at all", html: `<p>Just prose.</p>`, expected: "skip" },
  { name: "one valid block", html: block(PRODUCT), expected: "pass" },
  { name: "a block of broken JSON", html: block(`{"@type":"Product",}`), expected: "fail" },
  { name: "a block declaring no type", html: block(`{"name":"A"}`), expected: "fail" },
  {
    name: "one valid block beside a broken one",
    html: block(PRODUCT) + block(`{oops}`),
    expected: "fail",
  },
];

for (const { name, html, expected } of parsesCases) {
  test(`structured_data_parses with ${name}`, () => {
    assert.equal(structuredDataParses(snapshotFrom(html)).status, expected);
  });
}

test("structured_data_parses skips with its own reason when there are no blocks", () => {
  const finding = structuredDataParses(snapshotFrom(`<p>Just prose.</p>`));

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "no JSON-LD blocks");
});

test("structured_data_parses names the block that broke and why", () => {
  const finding = structuredDataParses(snapshotFrom(block(PRODUCT) + block(`{oops}`)));

  assert.equal(finding.evidence.blockCount, 2);
  assert.equal(finding.evidence.parsedCount, 1);
  assert.deepEqual(
    (finding.evidence.parseErrors as { index: number }[]).map(({ index }) => index),
    [1],
  );
});

test("structured_data_parses reports a parsed block that declares no type", () => {
  const finding = structuredDataParses(snapshotFrom(block(`{"name":"A"}`)));

  assert.equal(finding.evidence.parsedCount, 1);
  assert.deepEqual(finding.evidence.parseErrors, [{ index: 0, message: "no @type found" }]);
});

test("both checks skip when HTML is null", () => {
  for (const finding of [
    structuredDataPresent(snapshotFrom(null)),
    structuredDataParses(snapshotFrom(null)),
  ]) {
    assert.equal(finding.status, "skip");
    assert.equal(finding.evidence.reason, "raw fetch failed");
  }
});
