import type { DocumentCapture, Finding, Rulebook } from "../types.ts";
import { skipped } from "../utils.ts";

const CRITERION = "documents.reachable";

// One rule: did PDF bytes arrive? A login page, a 404, an edge challenge and a
// timeout all leave an agent with no document, so the check does not branch on
// which of them happened — the evidence carries that.
export function reachable(document: DocumentCapture, _rulebook: Rulebook): Finding {
  const evidence = {
    statusCode: document.statusCode,
    finalUrl: document.finalUrl,
    contentType: document.contentType,
    bytes: document.bytes,
    error: document.error,
  };

  if (!document.fetched) return skipped(CRITERION, document.url, "not fetched", evidence);

  return {
    criterionKey: CRITERION,
    url: document.url,
    status: document.isPdf ? "pass" : "fail",
    evidence,
  };
}
