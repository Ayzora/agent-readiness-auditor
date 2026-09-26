import { CAPTURE_LIMIT_MS } from "./capture-pages.ts";
import {
  NOTHING_TO_FIX,
  describeDimension,
  describeTotal,
  fallbackNotice,
  urlCount,
} from "./print-report.ts";
import { MAX_SAMPLED_PAGES, templateBreakdown } from "./site-sample.ts";
import {
  AGENTS,
  type Agent,
  type Criterion,
  type Finding,
  type ReportCoverage,
  type Rulebook,
  type Scorecard,
} from "./types.ts";

export interface ReportInput {
  // The typed URL: the host in the title, and the page the agents were probed on.
  url: string;
  date: Date;
  findings: Finding[];
  scorecard: Scorecard;
  rulebook: Rulebook;
  coverage: ReportCoverage;
}

// Pure, like the scorecard: no network, disk or clock, so the same input always
// renders the same text, whether its findings come from memory or, later, a database.
// The rulebook supplies every sentence; the findings supply every number.
export function renderReport(input: ReportInput): string {
  const { url, date, rulebook } = input;
  const criteria = new Map(rulebook.criteria.map((criterion) => [criterion.key, criterion]));

  return [
    `# Agent-readiness report — ${new URL(url).hostname}`,
    `${localDate(date)} · rulebook ${rulebook.version}`,
    "## Coverage",
    coverageSection(input.coverage, url),
    "## Headline",
    headlineSection(input, criteria),
    "## Access reality check",
    accessSection(input.findings, url),
    "## Fix first",
    fixFirstSection(input, criteria),
    "## Observations",
    observationsSection(input.findings, criteria),
    "## Not checked",
    notCheckedSection(input.findings, criteria),
  ].join("\n\n") + "\n";
}

function coverageSection(coverage: ReportCoverage, url: string): string {
  if (coverage.kind === "fallback") return fallbackNotice(coverage.reason, code(url));

  const sampled = coverage.templates.filter((template) => template.sampled.length > 0);
  const lines = [
    `Sampled ${count(coverage.pages.length, "page")} from ${count(sampled.length, "template")}, out of ${coverage.eligibleCount.toLocaleString("en-US")} eligible URLs in ${code(coverage.sitemapUrl)}.`,
    table(
      ["Template", "URLs in sitemap", "Sampled", "Sampled pages"],
      sampled.map((template) => [
        code(template.label),
        template.size.toLocaleString("en-US"),
        String(template.sampled.length),
        template.sampled.map(code).join(", "),
      ]),
    ),
  ];

  if (coverage.templatesLeftOut > 0)
    lines.push(
      `${count(coverage.templatesLeftOut, "template")} not sampled because of the ${MAX_SAMPLED_PAGES}-page cap.`,
    );
  if (coverage.notCaptured.length > 0)
    lines.push(
      `${count(coverage.notCaptured.length, "page")} not captured because the ${CAPTURE_LIMIT_MS / 60_000}-minute limit was reached.`,
    );
  if (coverage.unreachable.length > 0)
    lines.push(`Unreachable: ${coverage.unreachable.map(code).join(", ")}.`);

  return lines.join("\n\n");
}

function headlineSection(input: ReportInput, criteria: Map<string, Criterion>): string {
  const { scorecard, rulebook } = input;
  const [total, note] = describeTotal(scorecard);

  const lines = [
    table(
      ["Dimension", "Score", "Note"],
      scorecard.dimensions.map((entry) => {
        const [value, dimensionNote] = describeDimension(entry);
        return [capitalise(entry.dimension), value, dimensionNote ?? ""];
      }),
    ),
    `**Total: ${total}**${note ? ` (${note})` : ""}`,
  ];

  for (const gate of scorecard.gates) {
    const reason = rulebook.gates.find((entry) => entry.criterion === gate.criterion)?.reason;
    lines.push(`Gate: ${reason ?? gate.criterion} — total capped at ${gate.cap}.`);
  }

  const first = scorecard.fixFirst[0];
  lines.push(first ? `Biggest cost: ${criteria.get(first.criterionKey)!.title}` : NOTHING_TO_FIX);

  return lines.join("\n\n");
}

type ProbeOutcome = "got through" | "asked to pay" | `blocked (${string})` | "no answer";

// Rebuilt from the access findings' evidence rather than the capture, so the
// table can be rendered from findings read back from storage.
function accessSection(findings: Finding[], url: string): string {
  const robots = findings.find((finding) => finding.criterionKey === "access.robots_allows_agents");
  if (!robots) return "Not measured: this run has no robots.txt finding.";

  const blockedAtRoot = agentList(robots.evidence.blockedAgents);
  const blockedFromPage = agentList(robots.evidence.blockedFromPage);
  const outcomes = new Map<string, ProbeOutcome>();

  const payment = findings.find((finding) => finding.criterionKey === "access.pay_per_crawl");
  if (payment?.status !== "skip")
    for (const agent of agentList(payment?.evidence.agents)) outcomes.set(agent, "asked to pay");

  const divergence = findings.find((finding) => finding.criterionKey === "access.policy_divergence");
  if (divergence?.status !== "skip") {
    const causes = (divergence?.evidence.causes ?? {}) as Record<string, string>;
    for (const agent of agentList(divergence?.evidence.agents)) {
      const cause = causes[agent] ?? "";
      // A cause is "challenged" or "HTTP <status>" when an answer came back;
      // anything else is why none did.
      outcomes.set(
        agent,
        cause === "challenged" || /^HTTP \d+$/.test(cause) ? `blocked (${code(cause)})` : "no answer",
      );
    }
  }

  const rows = AGENTS.map((agent) => [
    agent,
    blockedAtRoot.includes(agent)
      ? "disallowed at the site root"
      : blockedFromPage.includes(agent)
        ? "disallowed on the audited page"
        : "allowed",
    blockedFromPage.includes(agent) ? "not probed — disallowed" : (outcomes.get(agent) ?? "got through"),
  ]);

  return [
    `What robots.txt says to each agent, and what happened when the agent asked for ${code(url)}.`,
    table(["Agent", "robots.txt", "What happened"], rows),
  ].join("\n\n");
}

function fixFirstSection(input: ReportInput, criteria: Map<string, Criterion>): string {
  const { scorecard, findings, coverage } = input;
  if (scorecard.fixFirst.length === 0) return NOTHING_TO_FIX;

  return scorecard.fixFirst
    .map(({ criterionKey, subjects }, index) => {
      const criterion = criteria.get(criterionKey)!;
      const costly = findings.filter(
        (finding) =>
          finding.criterionKey === criterionKey && (finding.status === "fail" || finding.status === "warn"),
      );
      const lines = [
        `### ${index + 1}. ${criterion.title}`,
        `${criterion.dimension} · ${criterion.severity} · effort ${criterion.effort}`,
        criterion.why.trim(),
        `**Fix:** ${criterion.fix.trim()}`,
        `**Affected: ${subjects.length}**`,
        subjects
          .flatMap((subject) => costly.filter((finding) => finding.url === subject))
          .map((finding) => subjectLine(finding))
          .join("\n"),
      ];

      if (coverage.kind === "sample" && criterion.scope === "page") {
        const breakdown = templateBreakdown(subjects, coverage);
        if (breakdown.length > 0)
          lines.push(
            "**Templates:**",
            breakdown
              .map(
                (line) =>
                  `- ${code(line.label)} — ${line.affected} of ${line.audited} sampled (${urlCount(line.size)} in sitemap)`,
              )
              .join("\n"),
          );
      }

      return lines.join("\n\n");
    })
    .join("\n\n");
}

function observationsSection(findings: Finding[], criteria: Map<string, Criterion>): string {
  const groups = byCriterion(findings.filter((finding) => criteria.get(finding.criterionKey)?.scored === false));
  if (groups.length === 0) return "No observations this run.";

  return [
    "Measured and shown, but unscored: an observation costs the site nothing.",
    ...groups.map(([key, own]) => {
      const criterion = criteria.get(key)!;
      return [
        `### ${criterion.title}`,
        criterion.why.trim(),
        own.map((finding) => subjectLine(finding, finding.status)).join("\n"),
      ].join("\n\n");
    }),
  ].join("\n\n");
}

function notCheckedSection(findings: Finding[], criteria: Map<string, Criterion>): string {
  const groups = byCriterion(
    findings.filter(
      (finding) => finding.status === "skip" && criteria.get(finding.criterionKey)?.scored !== false,
    ),
  );
  if (groups.length === 0) return "Every check ran.";

  return [
    "These checks could not run, so they are left out of the scores rather than counted as a pass or a fail.",
    ...groups.map(([key, own]) =>
      [
        `### ${criteria.get(key)!.title} (${code(key)})`,
        own.map((finding) => `- ${code(finding.url)} — reason: ${value(finding.evidence.reason)}`).join("\n"),
      ].join("\n\n"),
    ),
  ].join("\n\n");
}

// In first-seen order, which is section order.
function byCriterion(findings: Finding[]): [string, Finding[]][] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings)
    groups.set(finding.criterionKey, [...(groups.get(finding.criterionKey) ?? []), finding]);
  return [...groups];
}

// One bullet per subject: the subject, then every measured value, never cut short.
function subjectLine(finding: Finding, status?: string): string {
  const parts = [code(finding.url), ...(status ? [status] : [])];
  const evidence = Object.entries(finding.evidence)
    .map(([name, entry]) => `${name}: ${value(entry)}`)
    .join(" · ");
  if (evidence) parts.push(evidence);
  return `- ${parts.join(" — ")}`;
}

function value(entry: unknown): string {
  if (entry === null || entry === undefined) return "—";
  if (typeof entry === "string") return code(entry);
  if (Array.isArray(entry)) {
    if (entry.length === 0) return "none";
    if (entry.every((item) => item === null || typeof item !== "object"))
      return entry.map(value).join(", ");
  }
  if (typeof entry === "object") return code(JSON.stringify(entry));
  return String(entry);
}

// Site text goes inside a code span, where *, <, _ and [ mean nothing to
// Markdown. The fence is longer than any backtick run inside, and a newline
// becomes a space so a list item or table row stays on one line.
function code(text: string): string {
  const flat = text.replace(/\s*\r?\n\s*/g, " ");
  if (flat === "") return '`""`';
  const longest = Math.max(0, ...[...flat.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

// A pipe ends a cell even inside a code span, so every cell escapes it.
function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

function agentList(entry: unknown): Agent[] {
  return Array.isArray(entry) ? (entry as Agent[]) : [];
}

function count(amount: number, noun: string): string {
  return `${amount.toLocaleString("en-US")} ${noun}${amount === 1 ? "" : "s"}`;
}

function localDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
