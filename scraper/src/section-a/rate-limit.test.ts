import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingHttpHeaders } from "node:http";
import type { FindingStatus, RateLimitCapture, RateLimitStop } from "../types.ts";
import { rateLimit, rateLimitStop } from "./rate-limit.ts";

const SITE_ROOT = "https://test.invalid/";

const stopCases: {
  name: string;
  response: { statusCode: number; headers: IncomingHttpHeaders } | null;
  stop: RateLimitStop | null;
}[] = [
  { name: "a 429 stops", response: { statusCode: 429, headers: {} }, stop: "429" },
  {
    name: "a Retry-After header stops",
    response: { statusCode: 200, headers: { "retry-after": "30" } },
    stop: "retry-after",
  },
  { name: "no answer stops", response: null, stop: "no answer" },
  { name: "a 503 does not stop", response: { statusCode: 503, headers: {} }, stop: null },
  { name: "a 200 does not stop", response: { statusCode: 200, headers: {} }, stop: null },
];

for (const { name, response, stop } of stopCases) {
  test(`rate-limit stop rule: ${name}`, () => {
    assert.equal(rateLimitStop(response), stop);
  });
}

const verdictCases: { name: string; capture: RateLimitCapture; status: FindingStatus }[] = [
  {
    name: "the ramp completed",
    capture: { limitFoundAt: null, stoppedBy: null, error: null },
    status: "pass",
  },
  {
    name: "stopped by a 429",
    capture: { limitFoundAt: 4, stoppedBy: "429", error: null },
    status: "warn",
  },
  {
    name: "stopped by a Retry-After header",
    capture: { limitFoundAt: 2, stoppedBy: "retry-after", error: null },
    status: "warn",
  },
  {
    name: "stopped by no answer",
    capture: { limitFoundAt: 8, stoppedBy: "no answer", error: "read ECONNRESET" },
    status: "warn",
  },
];

for (const { name, capture, status } of verdictCases) {
  test(`rate_limit: ${name} -> ${status}`, () => {
    const finding = rateLimit(SITE_ROOT, capture);

    assert.equal(finding.criterionKey, "access.rate_limit");
    assert.equal(finding.status, status);
    assert.equal(finding.evidence.limitFoundAt, capture.limitFoundAt);
    assert.equal(finding.evidence.stoppedBy, capture.stoppedBy);
  });
}
