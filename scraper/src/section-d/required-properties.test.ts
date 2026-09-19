import test from "node:test";
import assert from "node:assert/strict";
import { snapshotFrom } from "../utils.ts";
import { loadRulebook } from "../rulebook.ts";
import { requiredProperties } from "./required-properties.ts";
import type { FindingStatus } from "../types.ts";

const rulebook = loadRulebook();

const block = (json: string) => `<script type="application/ld+json">${json}</script>`;

const COMPLETE_PRODUCT = `{"@type":"Product","name":"Blue Mug","offers":{"@type":"Offer","price":"12.00","availability":"https://schema.org/InStock"}}`;
const COMPLETE_ORGANIZATION = `{"@type":"Organization","name":"Shop","url":"https://shop.test","sameAs":["https://x.com/shop"]}`;

// Fixtures name the property they are missing, so retuning the rulebook's table
// changes which assertion fires rather than silently passing.
const verdictCases: { name: string; html: string; expected: FindingStatus }[] = [
  { name: "a complete Product", html: block(COMPLETE_PRODUCT), expected: "pass" },
  { name: "a complete Organization", html: block(COMPLETE_ORGANIZATION), expected: "pass" },
  {
    name: "a Product missing offers.availability",
    html: block(`{"@type":"Product","name":"A","offers":{"@type":"Offer","price":"12.00"}}`),
    expected: "fail",
  },
  {
    name: "a Product with no offers at all",
    html: block(`{"@type":"Product","name":"A"}`),
    expected: "fail",
  },
  {
    name: "a Product whose name is an empty string",
    html: block(
      `{"@type":"Product","name":"","offers":{"price":"12.00","availability":"InStock"}}`,
    ),
    expected: "fail",
  },
  {
    name: "an Organization whose sameAs is an empty array",
    html: block(`{"@type":"Organization","name":"Shop","url":"https://shop.test","sameAs":[]}`),
    expected: "fail",
  },
  // schema.org permits an object or an array for offers, and sites emit both.
  {
    name: "a Product whose offers is an array of complete Offers",
    html: block(
      `{"@type":"Product","name":"A","offers":[{"price":"1.00","availability":"InStock"},{"price":"2.00","availability":"OutOfStock"}]}`,
    ),
    expected: "pass",
  },
  {
    name: "a Product whose offers array has one member missing a price",
    html: block(
      `{"@type":"Product","name":"A","offers":[{"price":"1.00","availability":"InStock"},{"availability":"InStock"}]}`,
    ),
    expected: "fail",
  },
  {
    name: "a FAQPage whose questions all have answers",
    html: block(
      `{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q1","acceptedAnswer":{"@type":"Answer","text":"A1"}},{"@type":"Question","name":"Q2","acceptedAnswer":{"text":"A2"}}]}`,
    ),
    expected: "pass",
  },
  {
    name: "a FAQPage with one unanswered question",
    html: block(
      `{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q1","acceptedAnswer":{"text":"A1"}},{"@type":"Question","name":"Q2"}]}`,
    ),
    expected: "fail",
  },
  // An empty array satisfies nothing, rather than being vacuously complete.
  {
    name: "a FAQPage with an empty mainEntity array",
    html: block(`{"@type":"FAQPage","mainEntity":[]}`),
    expected: "fail",
  },
  {
    name: "a known type beside an unknown one",
    html: block(COMPLETE_PRODUCT) + block(`{"@type":"BreadcrumbList","itemListElement":[]}`),
    expected: "pass",
  },
  {
    name: "an @type array whose known member is complete",
    html: block(
      `{"@type":["Product","Vehicle"],"name":"Van","offers":{"price":"1.00","availability":"InStock"}}`,
    ),
    expected: "pass",
  },
];

for (const { name, html, expected } of verdictCases) {
  test(`verdict with ${name}`, () => {
    assert.equal(requiredProperties(snapshotFrom(html), rulebook).status, expected);
  });
}

const skipCases: { name: string; html: string | null; reason: string }[] = [
  { name: "the raw fetch failed", html: null, reason: "raw fetch failed" },
  { name: "the page has no blocks", html: `<p>Just prose.</p>`, reason: "no parseable JSON-LD" },
  {
    name: "every block is broken JSON",
    html: block(`{oops}`),
    reason: "no parseable JSON-LD",
  },
  {
    name: "a block parses but declares no type",
    html: block(`{"name":"A"}`),
    reason: "no parseable JSON-LD",
  },
  // A legitimate type the rulebook has no opinion about is not a defective page.
  {
    name: "only unknown types are declared",
    html: block(`{"@type":"BreadcrumbList","itemListElement":[]}`),
    reason: "no known types declared",
  },
];

for (const { name, html, reason } of skipCases) {
  test(`skips when ${name}`, () => {
    const finding = requiredProperties(snapshotFrom(html), rulebook);

    assert.equal(finding.status, "skip");
    assert.equal(finding.evidence.reason, reason);
  });
}

test("names the missing property per type", () => {
  const finding = requiredProperties(
    snapshotFrom(block(`{"@type":"Product","name":"A","offers":{"price":"12.00"}}`)),
    rulebook,
  );

  assert.equal(finding.status, "fail");
  assert.deepEqual(finding.evidence.missing, {
    Product: { entities: 1, incomplete: 1, properties: ["offers.availability"] },
  });
  assert.deepEqual(finding.evidence.complete, []);
});

test("counts every entity of a type, and fails when any one is incomplete", () => {
  const finding = requiredProperties(
    snapshotFrom(block(`[${COMPLETE_PRODUCT},{"@type":"Product","name":"B"}]`)),
    rulebook,
  );

  assert.equal(finding.status, "fail");
  assert.deepEqual(finding.evidence.missing, {
    Product: { entities: 2, incomplete: 1, properties: ["offers.price", "offers.availability"] },
  });
});

test("reports a complete type alongside an incomplete one", () => {
  const finding = requiredProperties(
    snapshotFrom(block(COMPLETE_ORGANIZATION) + block(`{"@type":"Product","name":"A"}`)),
    rulebook,
  );

  assert.equal(finding.status, "fail");
  assert.deepEqual(finding.evidence.complete, ["Organization"]);
  assert.deepEqual(Object.keys(finding.evidence.missing as object), ["Product"]);
});

test("reports unknown types without judging them", () => {
  const finding = requiredProperties(
    snapshotFrom(block(COMPLETE_PRODUCT) + block(`{"@type":"BreadcrumbList","name":"crumbs"}`)),
    rulebook,
  );

  assert.deepEqual(finding.evidence.knownTypes, ["Product"]);
  assert.deepEqual(finding.evidence.unknownTypes, ["BreadcrumbList"]);
});
