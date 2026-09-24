import test from "node:test";
import assert from "node:assert/strict";
import { loadRulebook } from "../rulebook.ts";
import { accessFrom } from "../utils.ts";
import { judgeAccess } from "./index.ts";

const rulebook = loadRulebook();

const BASELINE_HTML = "<html><body><p>Welcome to the test site.</p></body></html>";

test("judgeAccess: a healthy site yields seven findings in order, all passing", () => {
  const findings = judgeAccess("https://test.invalid/page", accessFrom(), BASELINE_HTML, rulebook);

  assert.deepEqual(
    findings.map((finding) => finding.criterionKey),
    [
      "access.robots_allows_agents",
      "access.policy_divergence",
      "access.pay_per_crawl",
      "access.baseline_mismatch",
      "access.rate_limit",
      "access.sitemap_present",
      "access.sitemap_freshness",
    ],
  );
  assert.deepEqual(
    findings.map((finding) => finding.status),
    Array(7).fill("pass"),
  );
});
