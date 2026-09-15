import type { Finding } from "../types.ts";


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
