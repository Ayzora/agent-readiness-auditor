import type { DocumentCapture, Finding, Rulebook } from "../types.ts";
import { skipped } from "../utils.ts";

const CRITERION = "documents.tagged_structure";

// Binary, with no thresholds: the file either declares its structure or it does not.
export function taggedStructure(document: DocumentCapture, _rulebook: Rulebook): Finding {
  if (document.isTagged == null)
    return skipped(CRITERION, document.url, "document could not be parsed", {
      error: document.error,
    });

  return {
    criterionKey: CRITERION,
    url: document.url,
    status: document.isTagged ? "pass" : "fail",
    evidence: { isTagged: document.isTagged, taggedBy: document.taggedBy },
  };
}
