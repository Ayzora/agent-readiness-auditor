import type { IncomingHttpHeaders } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { gotScraping } from "got-scraping";
import type { Finding, RateLimitProbe } from "../types.ts";

const RATES = [1, 2, 4, 8]; // requests/second, hard cap 10
const STEP_MILLIS = 3000; // hold each rate this long

export async function rateLimitProbe(url: string): Promise<RateLimitProbe> {
  for (const rps of RATES) {
    const stepStart = performance.now();
    let requestsSent = 0;

    while (performance.now() - stepStart < STEP_MILLIS) {
      const response = await sendProbeRequest(url);
      requestsSent += 1;

      if (isRateLimited(response)) {
        return { passed: false, limitFoundAt: rps };
      }

      const nextSlot = stepStart + (requestsSent / rps) * 1000;
      await sleep(Math.max(0, nextSlot - performance.now()));
    }
  }

  return { passed: true, limitFoundAt: null };
}




function sendProbeRequest(url: string) {
  return gotScraping({
    url,
    throwHttpErrors: false,
    retry: { limit: 0 },
    followRedirect: false,
  });
}

function isRateLimited({
  statusCode,
  headers,
}: {
  statusCode: number;
  headers: IncomingHttpHeaders;
}): boolean {
  return statusCode === 429 || headers["retry-after"] !== undefined;
}

export function rateLimit(url: string, probe: RateLimitProbe): Finding {
  return {
    criterionKey: "access.rate_limit",
    url,
    status: probe.passed ? "pass" : "warn",
    evidence: { limitFoundAt: probe.limitFoundAt },
  };
}
