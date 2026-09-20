import test from "node:test";
import assert from "node:assert/strict";
import { documentFrom, snapshotFrom } from "../utils.ts";
import { loadRulebook } from "../rulebook.ts";
import type { PageSnapshot } from "../types.ts";
import { buildCorpus } from "./sequences.ts";
import { htmlEquivalent } from "./html-equivalent.ts";

const rulebook = loadRulebook();

// Distinct tokens, so how much of a document is findable in the HTML is a
// number the test can predict rather than a property of English prose.
const words = (prefix: string, count: number): string =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");

const page = (text: string): PageSnapshot => snapshotFrom(`<html><body><p>${text}</p></body></html>`);

const KEY = { isKeyDocument: true, keyTopic: "pricing", anchorText: "Pricing (PDF)" };

test("html_equivalent: a key document whose text is nowhere in the HTML fails", () => {
  const document = documentFrom({ ...KEY, text: words("alpha", 200) });
  const corpus = buildCorpus([page(words("beta", 200))]);

  const finding = htmlEquivalent(document, corpus, rulebook);

  assert.equal(finding.criterionKey, "documents.html_equivalent");
  assert.equal(finding.status, "fail");
  assert.equal(finding.evidence.coverageRatio, 0);
  assert.equal(finding.evidence.keyTopic, "pricing");
  assert.equal(finding.evidence.pagesCompared, 1);
});

test("html_equivalent: a key document mirrored in the HTML passes", () => {
  const document = documentFrom({ ...KEY, text: words("alpha", 200) });
  const corpus = buildCorpus([page(words("alpha", 200))]);

  const finding = htmlEquivalent(document, corpus, rulebook);

  assert.equal(finding.status, "pass");
  assert.equal(finding.evidence.coverageRatio, 1);
});

test("html_equivalent: a key document only half mirrored warns", () => {
  const document = documentFrom({ ...KEY, text: words("alpha", 200) });
  const corpus = buildCorpus([page(words("alpha", 100))]);

  const finding = htmlEquivalent(document, corpus, rulebook);

  assert.equal(finding.status, "warn");
  const ratio = finding.evidence.coverageRatio as number;
  assert.ok(ratio > 0.4 && ratio < 0.55, `expected a middling ratio, got ${ratio}`);
});

test("html_equivalent: the ratio is one-directional, so a short page carrying the facts passes", () => {
  // The document is ten times the page's length. A symmetric similarity
  // measure would score this low; coverage asks only what the HTML holds.
  const document = documentFrom({ ...KEY, text: words("alpha", 100) });
  const corpus = buildCorpus([page(`${words("alpha", 100)} ${words("extra", 900)}`)]);

  assert.equal(htmlEquivalent(document, corpus, rulebook).status, "pass");
});

test("html_equivalent: a non-key document is not judged", () => {
  const document = documentFrom({
    isKeyDocument: false,
    keyTopic: null,
    anchorText: "Installation manual",
    text: words("alpha", 200),
  });

  const finding = htmlEquivalent(document, buildCorpus([page(words("beta", 200))]), rulebook);

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "not a key document");
});

test("html_equivalent: navigation shared by every page cannot manufacture a match", () => {
  const nav = words("nav", 60);
  const corpus = buildCorpus([
    page(`${nav} ${words("homepage", 80)}`),
    page(`${nav} ${words("about", 80)}`),
    page(`${nav} ${words("contact", 80)}`),
  ]);

  const document = documentFrom({ ...KEY, text: `${nav} ${words("alpha", 120)}` });
  const finding = htmlEquivalent(document, corpus, rulebook);

  assert.equal(finding.status, "fail");
  assert.equal(finding.evidence.coverageRatio, 0);
  // The nav sequences were dropped before scoring rather than counted as matches.
  assert.ok(
    (finding.evidence.sequencesSampled as number) < 173,
    "boilerplate should be excluded from the sample",
  );
});

test("html_equivalent: no captured HTML means no verdict", () => {
  const corpus = buildCorpus([snapshotFrom(null), snapshotFrom(null)]);
  const finding = htmlEquivalent(documentFrom({ ...KEY, text: words("alpha", 200) }), corpus, rulebook);

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "no HTML captured");
});

test("html_equivalent: a document too short to sample is not judged", () => {
  const finding = htmlEquivalent(
    documentFrom({ ...KEY, text: "Rate card 2026" }),
    buildCorpus([page(words("beta", 200))]),
    rulebook,
  );

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "document text too short to compare");
});

test("html_equivalent: a page whose raw fetch failed is not part of the corpus", () => {
  const corpus = buildCorpus([snapshotFrom(null), page(words("alpha", 200))]);

  assert.equal(corpus.pagesCompared, 1);
});
