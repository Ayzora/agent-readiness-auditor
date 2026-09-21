import test from "node:test";
import assert from "node:assert/strict";
import { llmsTxtFrom } from "../utils.ts";
import { loadRulebook } from "../rulebook.ts";
import type { FindingStatus, LlmsTxtCapture } from "../types.ts";
import { llmsTxtPresent } from "./llms-txt.ts";

const rulebook = loadRulebook();

const AUDITED_URL = "https://test.invalid/docs/guide";
const SITE_ROOT = "https://test.invalid/";

const THREE_LINKS = [
  "# Acme Docs",
  "",
  "> Everything an agent needs to use Acme.",
  "",
  "## Docs",
  "- [Quickstart](/quickstart): start here",
  "- [API reference](/api)",
  "- [Guides](/guides)",
  "",
].join("\n");

const verdictCases: {
  name: string;
  capture: LlmsTxtCapture;
  status: FindingStatus;
  evidence: Record<string, unknown>;
}[] = [
  {
    name: "no llms.txt at all",
    capture: llmsTxtFrom({ statusCode: 404, body: "Not Found" }),
    status: "warn",
    evidence: { found: false },
  },
  {
    name: "the host answered with an HTML page",
    capture: llmsTxtFrom({
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!DOCTYPE html><html><body>Page not found</body></html>",
    }),
    status: "warn",
    evidence: { looksLikeHtml: true },
  },
  {
    name: "an HTML body served as text/plain",
    capture: llmsTxtFrom({
      contentType: "text/plain",
      body: "<!DOCTYPE html><html><body>Page not found</body></html>",
    }),
    status: "warn",
    evidence: { looksLikeHtml: true },
  },
  {
    name: "a valid file",
    capture: llmsTxtFrom({ body: THREE_LINKS }),
    status: "pass",
    evidence: { found: true, linkCount: 3, hasBlockquoteSummary: true },
  },
  {
    name: "the same file behind a byte-order mark",
    capture: llmsTxtFrom({ body: `﻿${THREE_LINKS}` }),
    status: "pass",
    evidence: { found: true, hasH1: true, linkCount: 3 },
  },
  {
    name: "a stub with a title and nothing behind it",
    capture: llmsTxtFrom({ body: "# Acme Docs\n" }),
    status: "warn",
    evidence: { hasH1: true, linkCount: 0 },
  },
  {
    name: "links written as prose outside any section",
    capture: llmsTxtFrom({ body: "# Acme Docs\n\n- [Quickstart](/quickstart)\n- [Guides](/guides)\n" }),
    status: "warn",
    evidence: { hasH1: true, linkCount: 0 },
  },
  {
    name: "a file list with no title above it",
    capture: llmsTxtFrom({ body: "## Docs\n- [Quickstart](/quickstart)\n" }),
    status: "warn",
    evidence: { hasH1: false, found: false, linkCount: 1 },
  },
  {
    name: "a valid file with no summary",
    capture: llmsTxtFrom({ body: "# Acme Docs\n\n## Docs\n- [Quickstart](/quickstart)\n" }),
    status: "pass",
    evidence: { hasBlockquoteSummary: false },
  },
  {
    name: "the fetch never got an answer",
    capture: llmsTxtFrom({
      statusCode: null,
      contentType: null,
      body: null,
      bytes: null,
      error: "fetch failed",
    }),
    status: "skip",
    evidence: { reason: "llms.txt fetch failed", error: "fetch failed" },
  },
];

for (const { name, capture, status, evidence } of verdictCases) {
  test(`llms_txt: ${name} -> ${status}`, () => {
    const finding = llmsTxtPresent(AUDITED_URL, capture, rulebook);

    assert.equal(finding.criterionKey, "provenance.llms_txt");
    assert.equal(finding.status, status);
    for (const [key, expected] of Object.entries(evidence)) {
      assert.equal(finding.evidence[key], expected, `evidence.${key}`);
    }
  });
}

test("llms_txt: the subject is the site, not the page the audit visited", () => {
  const finding = llmsTxtPresent(AUDITED_URL, llmsTxtFrom(), rulebook);

  assert.equal(finding.url, SITE_ROOT);
});

test("llms_txt: no capture produces a fail", () => {
  for (const { capture } of verdictCases) {
    assert.notEqual(llmsTxtPresent(AUDITED_URL, capture, rulebook).status, "fail");
  }
});
