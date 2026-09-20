import type { DocumentCapture, Finding, FindingStatus, Rulebook } from "../types.ts";
import { skipped, thresholdsFor } from "../utils.ts";
import { coverageOf, type HtmlCorpus } from "./sequences.ts";

const CRITERION = "documents.html_equivalent";

// Only key documents are asked this. A manual, a datasheet or a printable form
// has no HTML equivalent by nature, and failing one would be the overstatement
// this tool is positioned against.
export function htmlEquivalent(
  document: DocumentCapture,
  corpus: HtmlCorpus,
  rulebook: Rulebook,
): Finding {
  const { fail, warn } = thresholdsFor(rulebook, CRITERION);
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, document.url, reason, evidence);

  if (!document.isKeyDocument) return skip("not a key document", { anchorText: document.anchorText });

  if (corpus.pagesCompared === 0) return skip("no HTML captured");

  const { ratio, sampled, matched } = coverageOf(document.text, corpus);

  if (ratio === null)
    return skip("document text too short to compare", {
      totalChars: document.text?.length ?? 0,
      error: document.error,
    });

  let status: FindingStatus;
  if (ratio < fail) {
    status = "fail";
  } else if (ratio < warn) {
    status = "warn";
  } else {
    status = "pass";
  }

  return {
    criterionKey: CRITERION,
    url: document.url,
    status,
    evidence: {
      coverageRatio: ratio,
      sequencesSampled: sampled,
      sequencesMatched: matched,
      pagesCompared: corpus.pagesCompared,
      keyTopic: document.keyTopic,
    },
  };
}
