import test from "node:test";
import assert from "node:assert/strict";
import { documentFrom } from "../utils.ts";
import { loadRulebook } from "../rulebook.ts";
import type { FindingStatus } from "../types.ts";
import { reachable } from "./reachable.ts";
import { textLayer } from "./text-layer.ts";
import { taggedStructure } from "./tagged-structure.ts";
import { size } from "./size.ts";

const rulebook = loadRulebook();

const MB = 1024 * 1024;

// documents.reachable asks one question — did PDF bytes arrive? — so a login
// page, a 404 and a timeout must all land on the same verdict.
const reachableCases: { name: string; document: Parameters<typeof reachable>[0]; status: FindingStatus }[] = [
  {
    name: "a PDF arrived",
    document: documentFrom(),
    status: "pass",
  },
  {
    name: "the login page arrived instead",
    document: documentFrom({
      isPdf: false,
      statusCode: 200,
      contentType: "text/html",
      finalUrl: "https://test.invalid/login",
    }),
    status: "fail",
  },
  {
    name: "the document is gone",
    document: documentFrom({ isPdf: false, statusCode: 404, error: "HTTP 404" }),
    status: "fail",
  },
  {
    name: "the edge challenged the fetch",
    document: documentFrom({ isPdf: false, statusCode: 403, error: "HTTP 403" }),
    status: "fail",
  },
  {
    name: "the fetch timed out",
    document: documentFrom({ isPdf: false, statusCode: null, error: "timeout after 15000ms" }),
    status: "fail",
  },
  {
    name: "the probe chose not to fetch",
    document: documentFrom({ fetched: false, isPdf: false, bytes: 30 * MB }),
    status: "skip",
  },
];

for (const { name, document, status } of reachableCases) {
  test(`reachable: ${name} -> ${status}`, () => {
    const finding = reachable(document, rulebook);

    assert.equal(finding.criterionKey, "documents.reachable");
    assert.equal(finding.status, status);
    // The subject is the file, never the page that linked it.
    assert.equal(finding.url, document.url);
  });
}

test("reachable: a skip names why the probe declined", () => {
  const finding = reachable(documentFrom({ fetched: false, bytes: 30 * MB }), rulebook);

  assert.equal(finding.evidence.reason, "not fetched");
  assert.equal(finding.evidence.bytes, 30 * MB);
});

test("reachable: evidence explains a failure the check did not branch on", () => {
  const finding = reachable(
    documentFrom({ isPdf: false, statusCode: 302, finalUrl: "https://test.invalid/signin" }),
    rulebook,
  );

  assert.equal(finding.status, "fail");
  assert.equal(finding.evidence.statusCode, 302);
  assert.equal(finding.evidence.finalUrl, "https://test.invalid/signin");
});

const textLayerCases: { name: string; totalChars: number; pageCount: number; status: FindingStatus }[] = [
  { name: "a scan with nothing but an artefact", totalChars: 40, pageCount: 12, status: "fail" },
  { name: "part of the file is images", totalChars: 1800, pageCount: 12, status: "warn" },
  { name: "a real text layer", totalChars: 48_000, pageCount: 12, status: "pass" },
];

for (const { name, totalChars, pageCount, status } of textLayerCases) {
  test(`text_layer: ${name} -> ${status}`, () => {
    const finding = textLayer(documentFrom({ text: "x".repeat(totalChars), pageCount }), rulebook);

    assert.equal(finding.status, status);
    assert.equal(finding.evidence.totalChars, totalChars);
    assert.equal(finding.evidence.charsPerPage, totalChars / pageCount);
  });
}

test("text_layer: an unparsed page count skips rather than dividing by zero", () => {
  const finding = textLayer(documentFrom({ pageCount: 0, text: "" }), rulebook);

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "page count unavailable");
});

test("tagged_structure: a tagged document passes and names what declared it", () => {
  const finding = taggedStructure(
    documentFrom({ isTagged: true, taggedBy: "structTree" }),
    rulebook,
  );

  assert.equal(finding.status, "pass");
  assert.equal(finding.evidence.taggedBy, "structTree");
});

test("tagged_structure: an untagged document fails", () => {
  const finding = taggedStructure(documentFrom({ isTagged: false, taggedBy: null }), rulebook);

  assert.equal(finding.status, "fail");
});

test("tagged_structure: an unparsed document skips", () => {
  const finding = taggedStructure(
    documentFrom({ isTagged: null, taggedBy: null, error: "parse: bad XRef" }),
    rulebook,
  );

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "document could not be parsed");
});

const sizeCases: {
  name: string;
  bytes: number;
  pageCount: number;
  status: FindingStatus;
  decidedBy: string | null;
}[] = [
  { name: "a small document", bytes: 400_000, pageCount: 8, status: "pass", decidedBy: null },
  { name: "heavy bytes", bytes: 30 * MB, pageCount: 12, status: "fail", decidedBy: "bytes" },
  { name: "many pages", bytes: MB, pageCount: 400, status: "fail", decidedBy: "pageCount" },
  { name: "borderline bytes", bytes: 8 * MB, pageCount: 10, status: "warn", decidedBy: "bytes" },
  { name: "borderline pages", bytes: MB, pageCount: 80, status: "warn", decidedBy: "pageCount" },
];

for (const { name, bytes, pageCount, status, decidedBy } of sizeCases) {
  test(`size: ${name} -> ${status}`, () => {
    const finding = size(documentFrom({ bytes, pageCount }), rulebook);

    assert.equal(finding.status, status);
    assert.equal(finding.evidence.decidedBy, decidedBy);
    assert.equal(finding.evidence.bytes, bytes);
    assert.equal(finding.evidence.pageCount, pageCount);
  });
}

test("size: nothing measured skips", () => {
  const finding = size(documentFrom({ bytes: null, pageCount: null }), rulebook);

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "size unknown");
});
