import type { Finding, PageSnapshot } from "../types.ts";
import { skipped } from "../utils.ts";
import { collectJsonLd } from "./json-ld.ts";

export function structuredDataPresent(snapshot: PageSnapshot): Finding {
  const CRITERION = "semantics.structured_data_present";

  if (snapshot.rawHtml == null)
    return skipped(CRITERION, snapshot.url, "raw fetch failed", { error: snapshot.error });

  const { blockCount, parsedCount, entities, declaredTypes } = collectJsonLd(snapshot.rawHtml);

  // Blocks that declare nothing leave the page no better off than having none.
  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: entities.length === 0 ? "fail" : "pass",
    evidence: { blockCount, parsedCount, entityCount: entities.length, declaredTypes },
  };
}

export function structuredDataParses(snapshot: PageSnapshot): Finding {
  const CRITERION = "semantics.structured_data_parses";
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (snapshot.rawHtml == null) return skip("raw fetch failed", { error: snapshot.error });

  const { blockCount, parsedCount, errors } = collectJsonLd(snapshot.rawHtml);

  // The absence is structured_data_present's finding; failing here charges it twice.
  if (blockCount === 0) return skip("no JSON-LD blocks", { blockCount });

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: errors.length === 0 ? "pass" : "fail",
    evidence: { blockCount, parsedCount, parseErrors: errors },
  };
}
