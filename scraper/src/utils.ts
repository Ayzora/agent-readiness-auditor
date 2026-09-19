import type { Finding, PageSnapshot, Rulebook } from "./types.ts";

export function skipped(
  criterionKey: string,
  url: string,
  reason: string,
  evidence: Record<string, unknown> = {},
): Finding {
  return { criterionKey, url, status: "skip", evidence: { reason, ...evidence } };
}

export function percentage(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

// Reading a threshold the rulebook doesn't define throws instead of returning undefined.
export function thresholdsFor(rulebook: Rulebook, criterionKey: string): Record<string, number> {
  const thresholds = rulebook.criteria.find((criterion) => criterion.key === criterionKey)?.thresholds;
  if (!thresholds) throw new Error(`criteria.yaml has no thresholds for ${criterionKey}`);

  return new Proxy(thresholds, {
    get(target, name) {
      if (typeof name === "string" && !(name in target))
        throw new Error(`criteria.yaml has no threshold "${name}" for ${criterionKey}`);
      return target[name as string];
    },
  });
}



export const Clamp = (num: number) => Math.min(Math.max(num, 0), 1);

// .invalid is reserved by RFC 2606, so a snapshot that leaks into fetching code fails fast.
const TEST_URL = "https://test.invalid/page";

export function snapshotFrom(
  rawHtml: string | null,
  overrides: Partial<PageSnapshot> = {},
): PageSnapshot {
  return {
    url: TEST_URL,
    resolvedUrl: null,
    rawHtml,
    renderedHtml: null,
    visibleText: null,
    domText: null,
    statusCode: null,
    headers: null,
    redirectChain: [],
    browserFinalUrl: null,
    renderSettled: null,
    timing: { rawMs: null, renderedMs: null },
    error: null,
    ...overrides,
  };
}
