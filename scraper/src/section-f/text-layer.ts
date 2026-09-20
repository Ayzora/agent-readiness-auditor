import type { DocumentCapture, Finding, FindingStatus, Rulebook } from "../types.ts";
import { skipped, thresholdsFor } from "../utils.ts";

const CRITERION = "documents.text_layer";

export function textLayer(document: DocumentCapture, rulebook: Rulebook): Finding {
  const { min_chars_per_page, warn_chars_per_page } = thresholdsFor(rulebook, CRITERION);

  const pageCount = document.pageCount;
  const totalChars = document.text?.length ?? 0;

  if (pageCount == null || pageCount === 0)
    return skipped(CRITERION, document.url, "page count unavailable", {
      pageCount,
      totalChars,
      error: document.error,
    });

  const charsPerPage = totalChars / pageCount;

  let status: FindingStatus;
  if (charsPerPage < min_chars_per_page) {
    status = "fail";
  } else if (charsPerPage < warn_chars_per_page) {
    status = "warn";
  } else {
    status = "pass";
  }

  return {
    criterionKey: CRITERION,
    url: document.url,
    status,
    evidence: { pageCount, totalChars, charsPerPage },
  };
}
