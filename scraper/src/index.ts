import { capturePageWithInteractions } from "./interaction-probe.ts";
import { soft404Probe } from "./soft-404-probe.ts";
import { runSectionAAudit } from "./section-a/index.ts";
import { runSectionBAudit } from "./section-b/index.ts";
import { loadRulebook } from "./rulebook.ts";
import {
  printCapture,
  printDocumentCapture,
  printFindings,
  printSectionAFailure,
} from "./print-report.ts";
import { runSectionCAudit } from "./section-c/index.ts";
import { runSectionDAudit } from "./section-d/index.ts";
import { runSectionFAudit } from "./section-f/index.ts";
import { runSectionGAudit } from "./section-g/index.ts";
import { captureDocuments } from "./document-probe.ts";

const url = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))[0];

if (!url) {
  console.error("Usage: pnpm scraper <url>");
  process.exit(1);
}

const rulebook = loadRulebook();

const { snapshot, interactions } = await capturePageWithInteractions(url);

printCapture(snapshot, interactions);

const soft404 = await soft404Probe(url);

try {
  printFindings("Section A — access", await runSectionAAudit(url, snapshot, rulebook));
} catch (error) {
  printSectionAFailure(error);
}

printFindings("Section B — render", runSectionBAudit(snapshot, interactions, soft404, rulebook));

printFindings("Section C — structure", runSectionCAudit(snapshot, rulebook));

printFindings("Section D — semantics", runSectionDAudit(snapshot, rulebook));

const documents = await captureDocuments([snapshot], rulebook);

printDocumentCapture(documents);

printFindings("Section F — documents", runSectionFAudit([snapshot], documents.documents, rulebook));

printFindings(
  "Section G — provenance (observations, not scored)",
  await runSectionGAudit(url, rulebook),
);

