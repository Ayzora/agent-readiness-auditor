import test from "node:test";
import assert from "node:assert/strict";
import { snapshotFrom } from "./utils.ts";
import { loadRulebook } from "./rulebook.ts";
import { discoverDocuments } from "./document-probe.ts";

const rulebook = loadRulebook();

const pageAt = (url: string, body: string) =>
  snapshotFrom(`<html><body>${body}</body></html>`, { url, resolvedUrl: url });

const HOME = "https://example.com/";

test("a document linked from three pages is one candidate", () => {
  const footer = `<a href="/files/terms.pdf">Terms (PDF)</a>`;
  const { candidates } = discoverDocuments(
    [
      pageAt(HOME, footer),
      pageAt("https://example.com/about", footer),
      pageAt("https://example.com/contact", footer),
    ],
    rulebook,
  );

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0]!.linkedFrom, [
    HOME,
    "https://example.com/about",
    "https://example.com/contact",
  ]);
});

test("the query string does not make a second document", () => {
  const { candidates } = discoverDocuments(
    [
      pageAt(
        HOME,
        `<a href="/files/terms.pdf?v=2">Terms</a><a href="/files/terms.pdf">Terms again</a>`,
      ),
    ],
    rulebook,
  );

  assert.equal(candidates.length, 1);
});

test("a PDF on someone else's domain is counted but never fetched", () => {
  const { candidates, offDomain } = discoverDocuments(
    [
      pageAt(
        HOME,
        `<a href="https://cdn.example.com/a.pdf">ours</a>
         <a href="https://files.thirdparty.io/b.pdf">theirs</a>`,
      ),
    ],
    rulebook,
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.url),
    ["https://cdn.example.com/a.pdf"],
  );
  assert.equal(offDomain, 1);
});

test("a multi-part suffix does not split a site from its own CDN", () => {
  const { candidates, offDomain } = discoverDocuments(
    [pageAt("https://www.example.co.uk/", `<a href="https://files.example.co.uk/rates.pdf">Rates</a>`)],
    rulebook,
  );

  assert.equal(candidates.length, 1);
  assert.equal(offDomain, 0);
});

const keyTopicCases: { name: string; html: string; isKey: boolean; topic: string | null }[] = [
  {
    name: "the anchor text names a key topic",
    html: `<a href="/files/2026-q1.pdf">Our pricing</a>`,
    isKey: true,
    topic: "pricing",
  },
  {
    name: "the filename names a key topic",
    html: `<a href="/files/privacy-notice.pdf">Read this</a>`,
    isKey: true,
    topic: "privacy",
  },
  {
    name: "an icon link is labelled by its image's alt text",
    html: `<a href="/files/2026-q1.pdf"><img src="/pdf-icon.png" alt="Price list"></a>`,
    isKey: true,
    topic: "price",
  },
  {
    name: "a manual is not a key document",
    html: `<a href="/files/installation-manual.pdf">Installation manual</a>`,
    isKey: false,
    topic: null,
  },
];

for (const { name, html, isKey, topic } of keyTopicCases) {
  test(`key documents: ${name}`, () => {
    const { candidates } = discoverDocuments([pageAt(HOME, html)], rulebook);

    assert.equal(candidates[0]!.isKeyDocument, isKey);
    assert.equal(candidates[0]!.keyTopic, topic);
  });
}

test("key documents are fetched first, because the cap may cut the list short", () => {
  const { candidates } = discoverDocuments(
    [
      pageAt(
        HOME,
        `<a href="/a-manual.pdf">Manual</a>
         <a href="/b-handbook.pdf">Handbook</a>
         <a href="/c-pricing.pdf">Price list</a>`,
      ),
    ],
    rulebook,
  );

  assert.equal(candidates[0]!.url, "https://example.com/c-pricing.pdf");
});

const ignoredCases: { name: string; html: string }[] = [
  { name: "an in-page anchor", html: `<a href="#terms">Terms</a>` },
  { name: "a script handler", html: `<a href="javascript:open()">Terms</a>` },
  { name: "a mailto link", html: `<a href="mailto:hi@example.com">Mail us</a>` },
  { name: "an HTML page", html: `<a href="/terms">Terms</a>` },
  { name: "a PDF named in text only", html: `<a href="/downloads">Get the pdf</a>` },
];

for (const { name, html } of ignoredCases) {
  test(`discovery ignores ${name}`, () => {
    const { candidates } = discoverDocuments([pageAt(HOME, html)], rulebook);

    assert.deepEqual(candidates, []);
  });
}

test("an uppercase extension is still a PDF, and a fragment is not part of the URL", () => {
  const { candidates } = discoverDocuments(
    [pageAt(HOME, `<a href="/files/TERMS.PDF#page=3">Terms</a>`)],
    rulebook,
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.url),
    ["https://example.com/files/TERMS.PDF"],
  );
});

test("a page whose raw fetch failed contributes no candidates", () => {
  const { candidates } = discoverDocuments([snapshotFrom(null)], rulebook);

  assert.deepEqual(candidates, []);
});
