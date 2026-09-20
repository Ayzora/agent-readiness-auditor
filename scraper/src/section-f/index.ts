import type { DocumentCapture, Finding, PageSnapshot, Rulebook } from "../types.ts";
import { buildCorpus } from "./sequences.ts";
import { htmlEquivalent } from "./html-equivalent.ts";
import { reachable } from "./reachable.ts";
import { size } from "./size.ts";
import { taggedStructure } from "./tagged-structure.ts";
import { textLayer } from "./text-layer.ts";

// Synchronous on purpose, like Sections B, C and D: a function that cannot
// `await` cannot fetch. The snapshots are plural because html_equivalent asks
// whether a document's text appears anywhere in the HTML captured this run.
export function runSectionFAudit(
  snapshots: PageSnapshot[],
  documents: DocumentCapture[],
  rulebook: Rulebook,
): Finding[] {
  const corpus = buildCorpus(snapshots);

  return documents.flatMap((document) => findingsFor(document, corpus, rulebook));
}

function findingsFor(
  document: DocumentCapture,
  corpus: ReturnType<typeof buildCorpus>,
  rulebook: Rulebook,
): Finding[] {
  // Never opened, so there is no opinion to record: the other checks are
  // absent rather than skipped. Size is the exception — Content-Length told us
  // how big the file was before we declined to download it.
  if (!document.fetched) {
    return document.bytes == null
      ? [reachable(document, rulebook)]
      : [reachable(document, rulebook), size(document, rulebook)];
  }

  if (!document.isPdf) return [reachable(document, rulebook)];

  return [
    reachable(document, rulebook),
    htmlEquivalent(document, corpus, rulebook),
    textLayer(document, rulebook),
    taggedStructure(document, rulebook),
    size(document, rulebook),
  ];
}
