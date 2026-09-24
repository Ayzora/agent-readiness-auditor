import type { IncomingHttpHeaders } from "node:http";
import type { Finding, RateLimitCapture, RateLimitStop } from "../types.ts";

// The ramp must decide in Phase 1 whether to send its next request, so the
// rule it decides by is kept pure here. `null` is a request with no answer.
// A 5xx does not stop the ramp: it is an error, not a limit.
export function rateLimitStop(
  response: { statusCode: number; headers: IncomingHttpHeaders } | null,
): RateLimitStop | null {
  if (response === null) return "no answer";
  if (response.statusCode === 429) return "429";
  if (response.headers["retry-after"] !== undefined) return "retry-after";
  return null;
}

export function rateLimit(url: string, capture: RateLimitCapture): Finding {
  const { limitFoundAt, stoppedBy, error } = capture;

  return {
    criterionKey: "access.rate_limit",
    url,
    status: stoppedBy === null ? "pass" : "warn",
    evidence: { limitFoundAt, stoppedBy, ...(error ? { error } : {}) },
  };
}
