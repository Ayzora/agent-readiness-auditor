import test from "node:test";
import assert from "node:assert/strict";
import { documentFrom, snapshotFrom } from "../utils.ts";
import { loadRulebook } from "../rulebook.ts";
import { runSectionFAudit } from "./index.ts";

const rulebook = loadRulebook();

const MB = 1024 * 1024;

const snapshots = [snapshotFrom("<html><body><p>A page with some words on it.</p></body></html>")];

const keysOf = (findings: { criterionKey: string }[]): string[] =>
  findings.map((finding) => finding.criterionKey);

test("a document that opened is judged by all five checks", () => {
  const findings = runSectionFAudit(snapshots, [documentFrom({ text: "x".repeat(4000) })], rulebook);

  assert.deepEqual(keysOf(findings), [
    "documents.reachable",
    "documents.html_equivalent",
    "documents.text_layer",
    "documents.tagged_structure",
    "documents.size",
  ]);
});

// Never opened means no opinion: the other checks are absent, not skipped, so a
// report is not flooded with rows that say nothing.
test("a document that was not a PDF yields only the reachable finding", () => {
  const findings = runSectionFAudit(
    snapshots,
    [documentFrom({ isPdf: false, text: null, pageCount: null, isTagged: null })],
    rulebook,
  );

  assert.deepEqual(keysOf(findings), ["documents.reachable"]);
  assert.equal(findings[0]!.status, "fail");
});

test("a document over the ceiling still reports its size", () => {
  const findings = runSectionFAudit(
    snapshots,
    [
      documentFrom({
        fetched: false,
        isPdf: false,
        bytes: 30 * MB,
        text: null,
        pageCount: null,
        isTagged: null,
      }),
    ],
    rulebook,
  );

  assert.deepEqual(keysOf(findings), ["documents.reachable", "documents.size"]);
  assert.equal(findings[0]!.status, "skip");
  assert.equal(findings[1]!.status, "fail");
});

test("a document the budget never reached reports nothing but the skip", () => {
  const findings = runSectionFAudit(
    snapshots,
    [
      documentFrom({
        fetched: false,
        isPdf: false,
        bytes: null,
        text: null,
        pageCount: null,
        isTagged: null,
        error: "run budget spent",
      }),
    ],
    rulebook,
  );

  assert.deepEqual(keysOf(findings), ["documents.reachable"]);
  assert.equal(findings[0]!.status, "skip");
});

test("every finding's subject is the document, whatever linked it", () => {
  const document = documentFrom({
    url: "https://test.invalid/files/terms.pdf",
    linkedFrom: [
      "https://test.invalid/",
      "https://test.invalid/about",
      "https://test.invalid/contact",
    ],
    text: "x".repeat(4000),
  });

  const findings = runSectionFAudit(snapshots, [document], rulebook);

  assert.equal(findings.length, 5);
  for (const finding of findings) {
    assert.equal(finding.url, "https://test.invalid/files/terms.pdf");
  }
});

test("a run with no documents produces no findings at all", () => {
  assert.deepEqual(runSectionFAudit(snapshots, [], rulebook), []);
});
