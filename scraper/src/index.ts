import { capturePages } from "./capture-pages.ts";
import { isUnreachable } from "./page-snapshot.ts";
import { soft404Probe } from "./soft-404-probe.ts";
import { captureSiteFiles } from "./site-files.ts";
import { sampleCoverage, sampleSite } from "./site-sample.ts";
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
  localDate,
  rulebookLabel,
} from "./print-report.ts";
import { runSectionCAudit } from "./section-c/index.ts";
import { runSectionDAudit } from "./section-d/index.ts";
import { runSectionFAudit } from "./section-f/index.ts";
import { runSectionGAudit } from "./section-g/index.ts";
import { captureDocuments } from "./document-probe.ts";
import { scoreFindings, undefinedCriterionKey } from "./scorecard.ts";
import { renderReport } from "./report.ts";
import { readAudit, storeAudit } from "./audit-store.ts";
import { parseArguments } from "./arguments.ts";
import type { Finding, ReportCoverage } from "./types.ts";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const USAGE = "Usage: pnpm scraper <url>, or pnpm scraper --audit <id>";

const command = parseArguments(process.argv.slice(2));

if (command.kind === "usage") {
  console.error(`${USAGE} — ${command.problem}.`);
  process.exit(1);
}

const rulebook = loadRulebook();

// Rebuilding contacts no website, so it branches off before any fetch.
if (command.kind === "rebuild") process.exit(await rebuildAudit(command.auditId));

const { url } = command;

// Every site-scope fetch builds on the URL, so a malformed one must stop here.
if (!URL.canParse(url) || !["http:", "https:"].includes(new URL(url).protocol)) {
  console.error(`Not a URL: ${url}. Usage: pnpm scraper <url>, including https://`);
  process.exit(1);
}

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

// The shape every printer reads: each template's size, not its URL list.
const coverage: ReportCoverage =
  sampling.kind === "sample"
    ? sampleCoverage(sampling.sample, {
        audited: snapshots.map((snapshot) => snapshot.url),
        unreachable: captures
          .filter(({ snapshot }) => isUnreachable(snapshot))
          .map(({ snapshot }) => snapshot.url),
        notCaptured: notStarted,
      })
    : { kind: "fallback", reason: sampling.reason };

if (coverage.kind === "sample") {
  printPages(coverage);
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

// One date for the run: the saved audit's created_at and the report header.
const date = new Date();

// Never fatal: a failed save falls back to the findings and coverage in memory.
const stored = await storeAudit(
  { typedUrl: url, date, rulesetVersion: rulebook.version, coverage },
  findings,
);
console.log("reason" in stored ? `Audit not saved — ${stored.reason}.` : `Audit ${stored.id} saved.`);

const audit = "reason" in stored ? { id: undefined, findings, coverage } : stored;

const scorecard = scoreFindings(audit.findings, rulebook);

printScorecard(scorecard, rulebook, audit.coverage);

await saveReport(
  renderReport({
    url,
    date,
    findings: audit.findings,
    scorecard,
    rulebook,
    coverage: audit.coverage,
    auditId: audit.id,
  }),
  new URL(url).hostname,
  date,
);

// `--audit <id>`: the saved audit's Scorecard and report under today's
// rulebook, from Supabase alone. Statuses are used as saved, never re-judged.
// Returns the exit code.
async function rebuildAudit(auditId: number): Promise<number> {
  const read = await readAudit(auditId);

  if (read.kind !== "done") {
    console.error(
      read.kind === "missing"
        ? `No audit ${auditId}.`
        : read.kind === "incomplete"
          ? `Audit ${auditId} is ${read.status} — its findings are incomplete, so no scorecard.`
          : `Could not read audit ${auditId} — ${read.reason}.`,
    );
    return 1;
  }

  const { audit } = read;

  // Checked here because scoreFindings would throw on it.
  const undefinedKey = undefinedCriterionKey(audit.findings, rulebook);
  if (undefinedKey !== null) {
    console.error(
      `Audit ${auditId} has findings for ${undefinedKey}, which criteria.yaml no longer defines.`,
    );
    return 1;
  }

  console.log(
    `Audit ${auditId} · ${audit.host} · ${localDate(audit.date)} · ${rulebookLabel(rulebook.version, audit.rulesetVersion)}`,
  );

  const scorecard = scoreFindings(audit.findings, rulebook);

  printScorecard(scorecard, rulebook, audit.coverage);

  // The header keeps the audit's own date; the filename takes the current
  // time, so rebuilding one audit twice never collides.
  await saveReport(
    renderReport({
      url: audit.typedUrl,
      date: audit.date,
      findings: audit.findings,
      scorecard,
      rulebook,
      coverage: audit.coverage,
      auditId,
      auditRulesetVersion: audit.rulesetVersion,
    }),
    audit.host,
    new Date(),
  );

  return 0;
}

// Never inside the repository, never over an earlier report, and never fatal:
// the audit is already on screen, so a failed save costs only the file.
async function saveReport(markdown: string, host: string, now: Date): Promise<void> {
  const folder = join(homedir(), "Downloads");
  const path = join(folder, `${host}-${timestamp(now)}.md`);

  try {
    // "wx" fails on an existing file, and writeFile never creates the folder.
    await writeFile(path, markdown, { flag: "wx" });
    console.log(`Report saved to ${path}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason =
      code === "ENOENT"
        ? `no folder at ${folder}`
        : code === "EEXIST"
          ? `${path} already exists`
          : code === "EACCES" || code === "EPERM"
            ? `no permission to write to ${folder}`
            : (error as Error).message;
    console.log(`Report not saved — ${reason}.`);
  }
}

function timestamp(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
