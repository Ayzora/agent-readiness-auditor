import { setTimeout as sleep } from "node:timers/promises";
import { capturePageWithInteractions } from "./interaction-probe.ts";
import type { PageCapture } from "./types.ts";

// Politeness constraints, like the rate-limit ramp and the document-probe caps:
// a change to them is a safety-sensitive change.
const PAUSE_BETWEEN_PAGES_MS = 1_000;
export const CAPTURE_LIMIT_MS = 15 * 60_000;

// The limit is checked before each page starts, so a page in flight is never cut short.
export async function capturePages(
  urls: string[],
): Promise<{ captures: PageCapture[]; notStarted: string[] }> {
  const startedAt = performance.now();
  const captures: PageCapture[] = [];

  for (const [index, url] of urls.entries()) {
    if (index > 0) await sleep(PAUSE_BETWEEN_PAGES_MS);
    if (performance.now() - startedAt >= CAPTURE_LIMIT_MS)
      return { captures, notStarted: urls.slice(index) };

    captures.push(await capturePageWithInteractions(url));
  }

  return { captures, notStarted: [] };
}
