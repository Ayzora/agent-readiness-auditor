import type { Finding, LlmsTxtCapture, Rulebook } from "../types.ts";
import { skipped, thresholdsFor } from "../utils.ts";

const CRITERION = "provenance.llms_txt";

export function llmsTxtPresent(url: string, capture: LlmsTxtCapture, rulebook: Rulebook): Finding {
  const { min_links } = thresholdsFor(rulebook, CRITERION);
  const siteRoot = new URL("/", url).href;
  const { statusCode, contentType, body, bytes, error } = capture;

  if (error) return skipped(CRITERION, siteRoot, "llms.txt fetch failed", { error });

  const text = (body ?? "").replace(/^\uFEFF/, "");
  const lines = text.split("\n");
  const firstNonEmptyLine = lines.find((line) => line.trim() !== "") ?? "";

  const looksLikeHtml =
    (contentType ?? "").toLowerCase().includes("text/html") ||
    /^\s*<(!doctype|html)/i.test(text);

  const hasH1 = /^#\s+\S/.test(firstNonEmptyLine);
  const hasBlockquoteSummary = lines.some((line) => /^>\s+\S/.test(line));

  const firstSectionIndex = lines.findIndex((line) => /^##\s/.test(line));
  const linkCount =
    firstSectionIndex === -1
      ? 0
      : lines
          .slice(firstSectionIndex)
          .filter((line) => /^\s*-\s*\[[^\]]+\]\([^)]+\)/.test(line)).length;

  const found = statusCode === 200 && !looksLikeHtml && hasH1;

  return {
    criterionKey: CRITERION,
    url: siteRoot,
    status: found && linkCount >= min_links ? "pass" : "warn",
    evidence: {
      found,
      statusCode,
      contentType,
      looksLikeHtml,
      hasH1,
      hasBlockquoteSummary,
      linkCount,
      bytes,
    },
  };
}
