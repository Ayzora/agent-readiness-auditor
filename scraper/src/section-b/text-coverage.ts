import type { Finding, FindingStatus, PageSnapshot } from "../types.ts";
import { extractText } from "../extract-text.ts";

const FAIL_THRESHOLD = 0.3;
const PASS_THRESHOLD = 0.6;

const Clamp = (num: number) => Math.min(Math.max(num, 0), 1);

export function getTextCoverage(snapshot: PageSnapshot): Finding {
  let status: FindingStatus;
  const CRITERION = "render.text_coverage";

  const rawText = extractText(snapshot.rawHtml);
  const renderedText = extractText(snapshot.renderedHtml);

  const rawChars = rawText.length;
  const renderedChars = renderedText.length;

  if (snapshot.renderedHtml === null || renderedChars === 0) {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "skip",
      evidence: {
        rawChars,
        renderedChars,
        ratio: null,
        reason:
          snapshot.renderedHtml === null
            ? "render failed"
            : "rendered page has no text",
      },
    };
  }

  const unclampedRatio = rawChars / renderedChars;
  const ratio = Clamp(unclampedRatio);

  if (ratio < FAIL_THRESHOLD) {
    status = "fail";
  } else if (ratio < PASS_THRESHOLD) {
    status = "warn";
  } else {
    status = "pass";
  }

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      ratio,
      unclampedRatio,
      rawChars,
      renderedChars,
    },
  };
}

export function getEmptyRenderedPage(snapshot: PageSnapshot): Finding {
  const CRITERION = "render.empty_rendered_page";

  const renderedChars = extractText(snapshot.renderedHtml).length;

  if (snapshot.renderedHtml === null)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "skip",
      evidence: { renderedChars: null, error: snapshot.error },
    };
  if (renderedChars === 0)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "fail",
      evidence: { renderedChars },
    };

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: "pass",
    evidence: { renderedChars },
  };
}
