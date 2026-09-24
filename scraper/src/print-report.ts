import type {
  DimensionScore,
  DocumentProbe,
  Finding,
  FindingStatus,
  InteractionCapture,
  PageSnapshot,
  Rulebook,
  Scorecard,
} from "./types.ts";

const STATUS_ORDER = ["fail", "warn", "skip", "pass"] as const;

const MAX_EVIDENCE_VALUE_CHARS = 160;

const SCORECARD_LABEL_WIDTH = 14;
const SCORECARD_VALUE_WIDTH = 6;
const WRAP_WIDTH = 76;

export function printCapture(snapshot: PageSnapshot, interactions: InteractionCapture | null): void {
  console.log("=== Capture ===\n");
  console.log(`  url             ${snapshot.url}`);
  console.log(`  resolvedUrl     ${snapshot.resolvedUrl ?? "—"}`);
  console.log(`  browserFinalUrl ${snapshot.browserFinalUrl ?? "—"}`);
  console.log(`  statusCode      ${snapshot.statusCode ?? "—"}`);
  console.log(`  renderSettled   ${snapshot.renderSettled ?? "—"}`);
  console.log(`  redirectChain   ${snapshot.redirectChain.length}`);
  console.log(
    `  timing          raw ${snapshot.timing.rawMs ?? "—"}ms, rendered ${snapshot.timing.renderedMs ?? "—"}ms`,
  );
  console.log(
    `  interactions    ${
      interactions
        ? `${interactions.clicks} clicks, ${interactions.elapsedMs}ms`
        : "not captured — every interaction check skips"
    }`,
  );
  if (snapshot.error) console.log(`  error           ${snapshot.error}`);
}

// Discovered versus fetched, so the report never implies every document was examined.
export function printDocumentCapture(probe: DocumentProbe): void {
  const fetched = probe.documents.filter((document) => document.fetched).length;
  const key = probe.documents.filter((document) => document.isKeyDocument).length;

  console.log("\n=== Documents ===\n");
  console.log(`  discovered      ${probe.discovered} (${key} key, ${probe.offDomain} off-domain)`);
  console.log(`  fetched         ${fetched} of ${probe.documents.length} attempted`);

  for (const document of probe.documents) {
    const detail = document.fetched
      ? `${document.isPdf ? "pdf" : "not a pdf"}, ${document.pageCount ?? "—"} pages, ${document.bytes ?? "—"} bytes`
      : `not fetched — ${document.error ?? "—"}`;
    console.log(`    ${document.url}  (${detail})`);
  }
}

export function printFindings(title: string, findings: Finding[]): void {
  const counts = STATUS_ORDER.map((status) => `${countOf(findings, status)} ${status}`).join(", ");
  console.log(`\n=== ${title} === (${findings.length} findings: ${counts})\n`);

  // Document findings name a file each, so the key alone would not say which.
  const subjects = new Set(findings.map((finding) => finding.url));

  for (const status of STATUS_ORDER) {
    const group = findings.filter((finding) => finding.status === status);
    if (group.length === 0) continue;

    console.log(`  ${status.toUpperCase()}`);
    for (const finding of group) {
      console.log(
        subjects.size > 1
          ? `    ${finding.criterionKey}  ${finding.url}`
          : `    ${finding.criterionKey}`,
      );

      const evidence = formatEvidence(finding.evidence);
      if (evidence) console.log(`      ${evidence}`);
    }
    console.log("");
  }
}

function countOf(findings: Finding[], status: FindingStatus): number {
  return findings.filter((finding) => finding.status === status).length;
}

function formatEvidence(evidence: Record<string, unknown>): string {
  return Object.entries(evidence)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join("  ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return truncate(JSON.stringify(value));
  if (typeof value === "string") return truncate(value);
  return String(value);
}

function truncate(text: string): string {
  return text.length > MAX_EVIDENCE_VALUE_CHARS
    ? `${text.slice(0, MAX_EVIDENCE_VALUE_CHARS)}…`
    : text;
}

// The words come from the rulebook here, at print time, so rewriting a fix:
// sentence never needs a re-score. No evidence: the section blocks print it.
export function printScorecard(scorecard: Scorecard, rulebook: Rulebook): void {
  console.log("\n=== Scorecard ===\n");

  for (const entry of scorecard.dimensions) {
    const [value, note] = describeDimension(entry);
    console.log(scorecardLine(capitalise(entry.dimension), value, note));
  }

  console.log("");
  console.log(scorecardLine("Total", ...describeTotal(scorecard)));

  for (const gate of scorecard.gates) {
    const reason = rulebook.gates.find((entry) => entry.criterion === gate.criterion)?.reason;
    console.log(scorecardLine("Gate", `${reason ?? gate.criterion} → cap ${gate.cap}`));
  }

  console.log("\n=== Fix first ===\n");

  if (scorecard.fixFirst.length === 0) {
    console.log("  Nothing to fix — no scored finding lost points.");
    return;
  }

  const entries = scorecard.fixFirst.map((entry) => ({
    ...entry,
    criterion: rulebook.criteria.find((criterion) => criterion.key === entry.criterionKey)!,
  }));
  const titleWidth = Math.max(...entries.map((entry) => entry.criterion.title.length)) + 2;
  const rankWidth = `${entries.length}.`.length;

  entries.forEach(({ criterion, subjects }, index) => {
    const rank = `${index + 1}.`.padEnd(rankWidth);
    const indent = " ".repeat(2 + rankWidth + 1);
    const tags = `${criterion.dimension} · ${criterion.severity} · effort ${criterion.effort}`;

    console.log(`  ${rank} ${criterion.title.padEnd(titleWidth)}${tags}`);
    for (const line of wrap(criterion.why.trim())) console.log(`${indent}${line}`);
    console.log(`${indent}Fix: ${criterion.fix}`);
    if (subjects.length === 1) console.log(`${indent}Affected: ${subjects[0]}`);
    else {
      console.log(`${indent}Affected: ${subjects.length}`);
      for (const subject of subjects) console.log(`${indent}  ${subject}`);
    }
    console.log("");
  });
}

function describeDimension(entry: DimensionScore): [string, string?] {
  if (entry.observational) return ["—", "observations, not scored"];
  if (entry.score !== null) return [String(Math.round(entry.score))];

  return entry.dimension === "documents" && entry.findingCount === 0
    ? ["N/A", "no linked documents found"]
    : ["N/A", "no scored findings"];
}

function describeTotal(scorecard: Scorecard): [string, string?] {
  if (scorecard.total === null)
    return ["—", "not computed: access could not be measured, so gates could not be checked"];

  const notes: string[] = [];
  if (scorecard.total < scorecard.uncappedTotal!) notes.push(`capped from ${scorecard.uncappedTotal}`);
  if (scorecard.leftOut.length > 0) {
    const counted = scorecard.dimensions.filter((entry) => !entry.observational).length;
    notes.push(
      `from ${counted - scorecard.leftOut.length} of ${counted} dimensions — ${scorecard.leftOut.join(", ")} N/A`,
    );
  }

  return [String(scorecard.total), notes.length > 0 ? notes.join("; ") : undefined];
}

function scorecardLine(label: string, value: string, note?: string): string {
  const line = `  ${label.padEnd(SCORECARD_LABEL_WIDTH)}${note ? value.padEnd(SCORECARD_VALUE_WIDTH) + note : value}`;
  return line.trimEnd();
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function wrap(text: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > WRAP_WIDTH) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
