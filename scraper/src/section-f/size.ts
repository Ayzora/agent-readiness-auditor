import type { DocumentCapture, Finding, FindingStatus, Rulebook } from "../types.ts";
import { skipped, thresholdsFor } from "../utils.ts";

const CRITERION = "documents.size";

const RANK: Record<FindingStatus, number> = { pass: 0, skip: 1, warn: 2, fail: 3 };

// Two measurements, worst verdict wins: a 400-page file and a 30 MB file are
// each skipped by an agent for their own reason.
export function size(document: DocumentCapture, rulebook: Rulebook): Finding {
  const { max_bytes_warn, max_bytes_fail, max_pages_warn, max_pages_fail } = thresholdsFor(
    rulebook,
    CRITERION,
  );

  const { bytes, pageCount } = document;

  if (bytes == null && pageCount == null)
    return skipped(CRITERION, document.url, "size unknown", { error: document.error });

  const byBytes = verdict(bytes, max_bytes_warn, max_bytes_fail);
  const byPages = verdict(pageCount, max_pages_warn, max_pages_fail);

  const status = RANK[byBytes] >= RANK[byPages] ? byBytes : byPages;
  const decidedBy = RANK[byBytes] >= RANK[byPages] ? "bytes" : "pageCount";

  return {
    criterionKey: CRITERION,
    url: document.url,
    status,
    evidence: { bytes, pageCount, decidedBy: status === "pass" ? null : decidedBy },
  };
}

function verdict(measured: number | null, warn: number, fail: number): FindingStatus {
  if (measured == null) return "pass";
  if (measured > fail) return "fail";
  if (measured > warn) return "warn";
  return "pass";
}
