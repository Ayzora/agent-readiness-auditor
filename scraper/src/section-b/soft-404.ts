import type { Finding, PageSnapshot, Rulebook, Soft404Probe } from "../types.ts";
import { extractText } from "../extract-text.ts";
import { skipped, thresholdsFor } from "../utils.ts";

export function soft404(
  snapshot: PageSnapshot,
  probe: Soft404Probe | null,
  rulebook: Rulebook,
): Finding {
  const CRITERION = "render.soft_404";
  const { fail, min_fingerprint_chars: minFingerprintChars } = thresholdsFor(rulebook, CRITERION);
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (probe === null) return skip("the soft-404 probe did not run");
  if (probe.statusCode === null)
    return skip("the soft-404 probe failed", { error: probe.error });

  if (snapshot.statusCode !== 200)
    return skip("the page's status is not 200", { statusCode: snapshot.statusCode });

  if (probe.statusCode !== 200)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: { probeUrl: probe.probeUrl, probeStatusCode: probe.statusCode },
    };

  const fingerprint = probe.fingerprint ?? "";
  if (fingerprint.length < minFingerprintChars)
    return skip("the error page has too little text to fingerprint", {
      probeUrl: probe.probeUrl,
      fingerprintChars: fingerprint.length,
    });

  const pageText = extractText(snapshot.rawHtml);
  if (pageText.length === 0) return skip("the page has no raw text to compare");

  const similarity = similarityTo(pageText, fingerprint);

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: similarity >= fail ? "fail" : "pass",
    evidence: {
      probeUrl: probe.probeUrl,
      probeStatusCode: probe.statusCode,
      statusCode: snapshot.statusCode,
      similarity,
      failSimilarity: fail,
      fingerprintChars: fingerprint.length,
      pageChars: pageText.length,
    },
  };
}

function similarityTo(pageText: string, fingerprint: string): number {
  const page = words(pageText);
  const error = words(fingerprint);

  const shared = [...page].filter((word) => error.has(word)).length;
  const union = page.size + error.size - shared;

  return union === 0 ? 0 : Number((shared / union).toFixed(2));
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}
