import { capturePageWithInteractions } from "./interaction-probe.ts";
import { soft404Probe } from "./soft-404-probe.ts";
import { runSectionAAudit } from "./section-a/index.ts";
import { runSectionBAudit } from "./section-b/index.ts";
import {
  printCapture,
  printFindings,
  printSectionA,
  printSectionAFailure,
} from "./print-report.ts";

const url = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))[0];

if (!url) {
  console.error("Usage: pnpm scraper <url>");
  process.exit(1);
}

const { snapshot, interactions } = await capturePageWithInteractions(url);

printCapture(snapshot, interactions);

const soft404 = await soft404Probe(url);

try {
  printSectionA(await runSectionAAudit(url, snapshot));
} catch (error) {
  printSectionAFailure(error);
}

printFindings(runSectionBAudit(snapshot, interactions, soft404));
