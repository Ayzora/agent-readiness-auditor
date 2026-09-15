// Helpers shared by Section B's check files. Only things with more than one
// caller belong here — a single-caller helper is easier to read beside the
// check that uses it.

import type { Finding } from "../types.ts";

// `skip` means the check could not run, and is excluded from scoring entirely —
// not a pass, which inflates the score, and not a fail, which defames the site.
// `reason` is mandatory because "no control on the page" and "the click did not
// go through" are different situations and a report should be able to say which.
export function skipped(
  criterionKey: string,
  url: string,
  reason: string,
  evidence: Record<string, unknown> = {},
): Finding {
  return { criterionKey, url, status: "skip", evidence: { reason, ...evidence } };
}

// Rounded to a whole percent, so evidence reads `18` rather than
// `18.34782608695652`. Callers check the denominator is not zero first.
export function percentage(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}
