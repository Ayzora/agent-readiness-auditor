import { capturePageWithInteractions } from "./interaction-probe.ts";
import { isUnreachable } from "./page-snapshot.ts";
import { soft404Probe } from "./soft-404-probe.ts";
import { runSectionAAudit } from "./section-a/index.ts";
import { runSectionBAudit } from "./section-b/index.ts";
import { loadRulebook } from "./rulebook.ts";
import {
  printCapture,
  printDocumentCapture,
  printFindings,
  printScorecard,
  printSectionAFailure,
} from "./print-report.ts";
import { runSectionCAudit } from "./section-c/index.ts";
import { runSectionDAudit } from "./section-d/index.ts";
import { runSectionFAudit } from "./section-f/index.ts";
import { runSectionGAudit } from "./section-g/index.ts";
import { captureDocuments } from "./document-probe.ts";
import { scoreFindings } from "./scorecard.ts";
import type { Finding } from "./types.ts";

const url = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))[0];

if (!url) {
  console.error("Usage: pnpm scraper <url>");
  process.exit(1);
}

const rulebook = loadRulebook();

const { snapshot, interactions } = await capturePageWithInteractions(url);

// Nothing but skips would follow, so stop before any other probe.
if (isUnreachable(snapshot)) {
  console.error(`Could not reach ${url} — ${snapshot.error ?? "no response"}. No audit produced.`);
  process.exit(1);
}

printCapture(snapshot, interactions);

const soft404 = await soft404Probe(url);

const findings: Finding[] = [];

function section(title: string, sectionFindings: Finding[]): void {
  printFindings(title, sectionFindings);
  findings.push(...sectionFindings);
}

// A Section A crash costs access its findings, not the run: access is then
// N/A and the scorecard withholds the total rather than show one without it.
try {
  section("Section A — access", await runSectionAAudit(url, snapshot, rulebook));
} catch (error) {
  printSectionAFailure(error);
}

section("Section B — render", runSectionBAudit(snapshot, interactions, soft404, rulebook));

section("Section C — structure", runSectionCAudit(snapshot, rulebook));

section("Section D — semantics", runSectionDAudit(snapshot, rulebook));

const documents = await captureDocuments([snapshot], rulebook);

printDocumentCapture(documents);

section("Section F — documents", runSectionFAudit([snapshot], documents.documents, rulebook));

section(
  "Section G — provenance (observations, not scored)",
  await runSectionGAudit(url, rulebook),
);

printScorecard(scoreFindings(findings, rulebook), rulebook);
