import type { Finding, FindingStatus, InteractionCapture, PageSnapshot } from "./types.ts";

const STATUS_ORDER = ["fail", "warn", "skip", "pass"] as const;

const MAX_EVIDENCE_VALUE_CHARS = 160;

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

export function printSectionAFailure(error: unknown): void {
  console.log("\n=== Section A — access ===\n");
  console.log(`  failed: ${error instanceof Error ? error.message : String(error)}`);
}

export function printFindings(title: string, findings: Finding[]): void {
  const counts = STATUS_ORDER.map((status) => `${countOf(findings, status)} ${status}`).join(", ");
  console.log(`\n=== ${title} === (${findings.length} findings: ${counts})\n`);

  for (const status of STATUS_ORDER) {
    const group = findings.filter((finding) => finding.status === status);
    if (group.length === 0) continue;

    console.log(`  ${status.toUpperCase()}`);
    for (const finding of group) {
      console.log(`    ${finding.criterionKey}`);

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
