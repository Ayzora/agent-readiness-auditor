import { capturePages } from "./capture-pages.ts";
import { isUnreachable } from "./page-snapshot.ts";
import { soft404Probe } from "./soft-404-probe.ts";
import { captureSiteFiles } from "./site-files.ts";
import { sampleSite } from "./site-sample.ts";
import { runSectionAAudit } from "./section-a/index.ts";
import { runSectionBAudit } from "./section-b/index.ts";
import { loadRulebook } from "./rulebook.ts";
import {
  printCapture,
  printCaptureLines,
  printDocumentCapture,
  printFallbackNotice,
  printFindings,
  printPages,
  printScorecard,
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

// Every site-scope fetch builds on the URL, so a malformed one must stop here.
if (!URL.canParse(url) || !["http:", "https:"].includes(new URL(url).protocol)) {
  console.error(`Not a URL: ${url}. Usage: pnpm scraper <url>, including https://`);
  process.exit(1);
}

const rulebook = loadRulebook();

// Before any page, because the sitemap chooses the pages.
const siteFiles = await captureSiteFiles(url);
const sampling = sampleSite(url, siteFiles.sitemaps);
const sample = sampling.kind === "sample" ? sampling.sample : null;

if (sampling.kind === "fallback") printFallbackNotice(sampling.reason, url);

// The typed URL is always captured first, so captures[0] is Section A's baseline.
const { captures, notStarted } = await capturePages(sample?.pages ?? [url]);
const audited = captures.filter(({ snapshot }) => !isUnreachable(snapshot));
const snapshots = audited.map(({ snapshot }) => snapshot);

// Nothing but skips would follow, so stop before any other probe.
if (audited.length === 0) {
  const { error } = captures[0].snapshot;
  console.error(
    sample
      ? `Could not reach any of the ${captures.length} sampled pages — ${error ?? "no response"}. No audit produced.`
      : `Could not reach ${url} — ${error ?? "no response"}. No audit produced.`,
  );
  process.exit(1);
}

if (sample) {
  printPages(sample, captures, notStarted);
  printCaptureLines(captures);
} else {
  printCapture(captures[0].snapshot, captures[0].interactions);
}

const soft404 = await soft404Probe(url);

const findings: Finding[] = [];

function section(title: string, sectionFindings: Finding[]): void {
  printFindings(title, sectionFindings, sample !== null);
  findings.push(...sectionFindings);
}

// After every page capture, so the rate-limit ramp never runs alongside one.
section(
  "Section A — access",
  await runSectionAAudit(url, siteFiles, captures[0].snapshot.rawHtml, rulebook),
);

section(
  "Section B — render",
  audited.flatMap(({ snapshot, interactions }) =>
    runSectionBAudit(snapshot, interactions, soft404, rulebook),
  ),
);

section(
  "Section C — structure",
  snapshots.flatMap((snapshot) => runSectionCAudit(snapshot, rulebook)),
);

section(
  "Section D — semantics",
  snapshots.flatMap((snapshot) => runSectionDAudit(snapshot, rulebook)),
);

const documents = await captureDocuments(snapshots, rulebook);

printDocumentCapture(documents);

section("Section F — documents", runSectionFAudit(snapshots, documents.documents, rulebook));

section(
  "Section G — provenance (observations, not scored)",
  await runSectionGAudit(url, rulebook),
);

printScorecard(
  scoreFindings(findings, rulebook),
  rulebook,
  sample ? { sample, audited: snapshots.map((snapshot) => snapshot.url) } : undefined,
);
