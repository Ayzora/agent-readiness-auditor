import type { Finding, PageSnapshot, Rulebook } from "../types.ts";
import { extractText } from "../extract-text.ts";
import { skipped, thresholdsFor } from "../utils.ts";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { Clamp } from "../utils.ts";

export function extractionRatio(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  const CRITERION = "structure.extraction_ratio";
  const { fail, warn } = thresholdsFor(rulebook, CRITERION);
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (snapshot.rawHtml == null)
    return skip("Raw fetch failed", { rawHtml: snapshot.rawHtml, error: snapshot.error });

  const { document } = parseHTML(snapshot.rawHtml);
  const article = new Readability(document).parse();

  const readableChars = extractText(article?.content).length;
  const rawChars = extractText(snapshot.rawHtml).length;

  if (rawChars === 0)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "fail",
      evidence: { ratio: null, rawChars, readableChars, readabilityFound: article != null },
    };

  const ratio = Clamp(readableChars / rawChars);

  if (ratio < fail) {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "fail",
      evidence: { ratio, rawChars, readableChars, readabilityFound: article != null },
    };
  } else if (ratio < warn) {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "warn",
      evidence: { ratio, rawChars, readableChars, readabilityFound: article != null },
    };
  } else {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: { ratio, rawChars, readableChars, readabilityFound: article != null },
    };
  }
}
