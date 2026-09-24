import test from "node:test";
import assert from "node:assert/strict";
import { findingFrom, rulebookFrom } from "./utils.ts";
import { renderReport, type ReportCoverage } from "./report.ts";
import { scoreFindings } from "./scorecard.ts";
import { AGENTS, type Finding, type Rulebook, type SiteSample } from "./types.ts";

const SITE = "https://example.com/";
const TYPED = "https://example.com/";
const PRICING = "https://example.com/pricing";
const RED_SHOE = "https://example.com/products/red-shoe";
const BLUE_HAT = "https://example.com/products/blue-hat";

// Round weights and the tie-breaking rules decide Fix first's order: ROI is
// weight × subjects ÷ effort, S=1 and L=6.
const rulebook: Rulebook = rulebookFrom(
  [
    { key: "access.robots_allows_agents", scope: "site", title: "robots.txt blocks AI agents" },
    { key: "access.policy_divergence", title: "The server blocks agents" },
    { key: "access.pay_per_crawl", title: "Agents are asked to pay" },
    { key: "render.text_coverage", effort: "L", title: "Content requires JavaScript" },
    { key: "render.images_missing_alt", title: "Images lack alt text" },
    { key: "structure.link_navigation", title: "Links are not links" },
    { key: "provenance.llms_txt", scored: false, scope: "site", title: "No llms.txt" },
  ],
  {
    gates: [
      { criterion: "access.robots_allows_agents", cap: 20, reason: "robots.txt blocks every AI agent" },
    ],
  },
);

// Every agent allowed and let through, and nothing else wrong.
function healthyAccess(overrides: { robots?: Partial<Finding>; divergence?: Partial<Finding>; pay?: Partial<Finding> } = {}): Finding[] {
  return [
    findingFrom({
      criterionKey: "access.robots_allows_agents",
      url: SITE,
      evidence: { robotsTxt: "parsed", statusCode: 200, blockedAgents: [], blockedFromPage: [] },
      ...overrides.robots,
    }),
    findingFrom({
      criterionKey: "access.policy_divergence",
      url: TYPED,
      evidence: { agents: [], causes: {} },
      ...overrides.divergence,
    }),
    findingFrom({
      criterionKey: "access.pay_per_crawl",
      url: TYPED,
      evidence: { agents: [] },
      ...overrides.pay,
    }),
  ];
}

const FALLBACK: ReportCoverage = { kind: "fallback", reason: "no sitemap" };

// Local-time components, so the date line does not move with the machine's zone.
const DATE = new Date(2026, 8, 24, 14, 30, 12);

function report(findings: Finding[], coverage: ReportCoverage = FALLBACK, book: Rulebook = rulebook): string {
  return renderReport({
    url: TYPED,
    date: DATE,
    findings,
    scorecard: scoreFindings(findings, book),
    rulebook: book,
    coverage,
  });
}

// The line of the report that starts with `prefix`; fails the test if none does.
function lineStarting(markdown: string, prefix: string): string {
  const line = markdown.split("\n").find((candidate) => candidate.startsWith(prefix));
  assert.ok(line, `no line starts with ${JSON.stringify(prefix)}`);
  return line;
}

// Everything under `## heading`, up to the next `## `.
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  assert.ok(start !== -1, `no section ${heading}`);
  const end = markdown.indexOf("\n## ", start + 1);
  return markdown.slice(start, end === -1 ? undefined : end);
}

function agentRow(markdown: string, agent: string): string {
  return lineStarting(section(markdown, "Access reality check"), `| ${agent} |`);
}

const sample: SiteSample = {
  sitemapUrl: "https://example.com/sitemap.xml",
  eligibleCount: 2410,
  templates: [
    { label: "/products/*", urls: Array.from({ length: 2140 }, (_, index) => (index === 0 ? RED_SHOE : index === 1 ? BLUE_HAT : `https://example.com/products/p${index}`)), sampled: [RED_SHOE, BLUE_HAT] },
    { label: "/", urls: [TYPED], sampled: [TYPED] },
    { label: "/pricing", urls: [PRICING], sampled: [PRICING] },
    { label: "/careers", urls: ["https://example.com/careers"], sampled: [] },
  ],
  pages: [TYPED, RED_SHOE, BLUE_HAT, PRICING],
  templatesLeftOut: 1,
};

const sampledCoverage: ReportCoverage = {
  kind: "sample",
  sample,
  audited: [TYPED, RED_SHOE, BLUE_HAT],
  unreachable: [PRICING],
  notCaptured: [],
};

test("renderReport: the seven parts appear in order", () => {
  const markdown = report(healthyAccess());

  const order = [
    "# Agent-readiness report — example.com",
    "## Coverage",
    "## Headline",
    "## Access reality check",
    "## Fix first",
    "## Observations",
    "## Not checked",
  ].map((heading) => markdown.indexOf(`${heading}\n`));

  assert.ok(order.every((index) => index !== -1), `missing a part: ${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("renderReport: the title carries the date and the rulebook version", () => {
  const markdown = report(healthyAccess());

  assert.ok(markdown.includes("2026-09-24"));
  assert.ok(markdown.includes("rulebook test"));
});

test("renderReport: a fallback run's Coverage is the notice alone", () => {
  const coverage = section(report(healthyAccess()), "Coverage");

  assert.ok(
    coverage.includes(
      "No sitemap found — auditing only `https://example.com/`. Results cover one page, not the site.",
    ),
  );
  assert.ok(!coverage.includes("| Template |"));
});

test("renderReport: a sampled run's Coverage has the summary line and one row per sampled template", () => {
  const coverage = section(report(healthyAccess(), sampledCoverage), "Coverage");

  assert.ok(
    coverage.includes(
      "Sampled 4 pages from 3 templates, out of 2,410 eligible URLs in `https://example.com/sitemap.xml`.",
    ),
  );
  assert.ok(coverage.includes("| Template | URLs in sitemap | Sampled | Sampled pages |"));
  assert.ok(
    coverage.includes(`| \`/products/*\` | 2,140 | 2 | \`${RED_SHOE}\`, \`${BLUE_HAT}\` |`),
  );
  assert.ok(!coverage.includes("`/careers`"), "an unsampled template has no row");
});

test("renderReport: Coverage names the templates left out, the pages not captured and the unreachable", () => {
  const coverage = section(
    report(healthyAccess(), { ...sampledCoverage, notCaptured: [BLUE_HAT, RED_SHOE] }),
    "Coverage",
  );

  assert.ok(coverage.includes("1 template not sampled because of the 40-page cap."));
  assert.ok(coverage.includes("2 pages not captured because the 15-minute limit was reached."));
  assert.ok(coverage.includes(`Unreachable: \`${PRICING}\`.`));
});

test("renderReport: Coverage says nothing about caps, limits or unreachable pages that did not apply", () => {
  const coverage = section(
    report(healthyAccess(), { ...sampledCoverage, sample: { ...sample, templatesLeftOut: 0 }, unreachable: [] }),
    "Coverage",
  );

  assert.ok(!coverage.includes("not sampled"));
  assert.ok(!coverage.includes("not captured"));
  assert.ok(!coverage.includes("Unreachable"));
});

test("renderReport: the Headline shows each dimension, and N/A and observational as the terminal does", () => {
  const headline = section(report(healthyAccess()), "Headline");

  assert.ok(headline.includes("| Access | 100 |"));
  assert.ok(headline.includes("| Render | N/A | no scored findings |"));
  assert.ok(headline.includes("| Provenance | — | observations, not scored |"));
});

test("renderReport: a capped total names the gate, its reason and its cap", () => {
  const findings = healthyAccess({
    robots: { status: "fail", evidence: { robotsTxt: "parsed", statusCode: 200, blockedAgents: [...AGENTS], blockedFromPage: [...AGENTS] } },
    divergence: { status: "skip", evidence: { reason: "no agents allowed to probe" } },
    pay: { status: "skip", evidence: { reason: "no agents allowed to probe" } },
  });
  // Two perfect dimensions beside a failed access lift the mean above the cap.
  findings.push(
    findingFrom({ criterionKey: "render.images_missing_alt", status: "pass" }),
    findingFrom({ criterionKey: "structure.link_navigation", status: "pass" }),
  );
  const headline = section(report(findings), "Headline");

  assert.ok(lineStarting(headline, "**Total:").includes("capped from"));
  assert.ok(headline.includes("robots.txt blocks every AI agent — total capped at 20"));
});

test("renderReport: a withheld total uses the terminal's wording", () => {
  const findings = [findingFrom({ criterionKey: "render.text_coverage", status: "fail" })];
  const headline = section(report(findings), "Headline");

  assert.ok(
    headline.includes("not computed: access could not be measured, so gates could not be checked"),
  );
});

test("renderReport: the biggest cost is Fix first #1's title", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "render.text_coverage", status: "fail", url: RED_SHOE }),
    findingFrom({ criterionKey: "render.images_missing_alt", status: "warn", url: RED_SHOE }),
  ];

  assert.ok(section(report(findings), "Headline").includes("Biggest cost: Images lack alt text"));
});

test("renderReport: nothing to fix replaces the biggest cost and fills Fix first", () => {
  const markdown = report(healthyAccess());

  assert.ok(section(markdown, "Headline").includes("Nothing to fix — no scored finding lost points."));
  assert.ok(!markdown.includes("Biggest cost"));
  assert.ok(section(markdown, "Fix first").includes("Nothing to fix — no scored finding lost points."));
});

const accessCases: { name: string; agent: string; findings: Finding[]; robots: string; happened: string }[] = [
  {
    name: "an agent allowed and let through got through",
    agent: "ChatGPT-User",
    findings: healthyAccess(),
    robots: "allowed",
    happened: "got through",
  },
  {
    name: "an agent answered with 402 was asked to pay",
    agent: "ChatGPT-User",
    findings: healthyAccess({ pay: { status: "warn", evidence: { agents: ["ChatGPT-User"] } } }),
    robots: "allowed",
    happened: "asked to pay",
  },
  {
    name: "an agent refused with a status was blocked, with its cause",
    agent: "Claude-User",
    findings: healthyAccess({
      divergence: { status: "warn", evidence: { agents: ["Claude-User"], causes: { "Claude-User": "HTTP 403" } } },
    }),
    robots: "allowed",
    happened: "blocked (`HTTP 403`)",
  },
  {
    name: "an agent challenged at the edge was blocked",
    agent: "Claude-User",
    findings: healthyAccess({
      divergence: { status: "warn", evidence: { agents: ["Claude-User"], causes: { "Claude-User": "challenged" } } },
    }),
    robots: "allowed",
    happened: "blocked (`challenged`)",
  },
  {
    name: "an agent whose request got no response had no answer",
    agent: "Perplexity-User",
    findings: healthyAccess({
      divergence: { status: "warn", evidence: { agents: ["Perplexity-User"], causes: { "Perplexity-User": "timeout of 10000ms exceeded" } } },
    }),
    robots: "allowed",
    happened: "no answer",
  },
  {
    name: "an agent disallowed on the audited page was not probed",
    agent: "Bingbot",
    findings: healthyAccess({
      robots: { status: "pass", evidence: { robotsTxt: "parsed", statusCode: 200, blockedAgents: [], blockedFromPage: ["Bingbot"] } },
    }),
    robots: "disallowed on the audited page",
    happened: "not probed — disallowed",
  },
  {
    name: "an agent disallowed at the site root says so",
    agent: "Googlebot",
    findings: healthyAccess({
      robots: { status: "warn", evidence: { robotsTxt: "parsed", statusCode: 200, blockedAgents: ["Googlebot"], blockedFromPage: ["Googlebot"] } },
    }),
    robots: "disallowed at the site root",
    happened: "not probed — disallowed",
  },
];

for (const { name, agent, findings, robots, happened } of accessCases) {
  test(`renderReport: Access reality check — ${name}`, () => {
    assert.equal(agentRow(report(findings), agent), `| ${agent} | ${robots} | ${happened} |`);
  });
}

test("renderReport: the Access reality check has one row per agent", () => {
  const rows = section(report(healthyAccess()), "Access reality check")
    .split("\n")
    .filter((line) => AGENTS.some((agent) => line.startsWith(`| ${agent} |`)));

  assert.equal(rows.length, AGENTS.length);
});

test("renderReport: Fix first lists entries in ROI order with the rulebook's words", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "render.text_coverage", status: "fail", url: RED_SHOE }),
    findingFrom({ criterionKey: "render.images_missing_alt", status: "warn", url: RED_SHOE }),
  ];
  const fixFirst = section(report(findings), "Fix first");

  const first = fixFirst.indexOf("### 1. Images lack alt text");
  const second = fixFirst.indexOf("### 2. Content requires JavaScript");
  assert.ok(first !== -1 && second > first, fixFirst);
  assert.ok(fixFirst.includes("render · medium · effort L"));
  assert.ok(fixFirst.includes("Why of render.text_coverage"));
  assert.ok(fixFirst.includes("**Fix:** Fix of render.text_coverage"));
});

test("renderReport: Fix first quotes every affected subject's evidence in full", () => {
  const snippet = "x".repeat(300);
  const findings = [
    ...healthyAccess(),
    findingFrom({
      criterionKey: "render.text_coverage",
      status: "fail",
      url: RED_SHOE,
      evidence: { ratio: 0.12, rawChars: 812, renderedChars: 6600 },
    }),
    findingFrom({
      criterionKey: "render.text_coverage",
      status: "fail",
      url: BLUE_HAT,
      evidence: { ratio: 0.09, snippet, missing: null, agents: ["GPTBot", "ClaudeBot"], none: [] },
    }),
  ];
  const fixFirst = section(report(findings), "Fix first");

  assert.ok(fixFirst.includes("**Affected: 2**"));
  assert.ok(fixFirst.includes(`- \`${RED_SHOE}\` — ratio: 0.12 · rawChars: 812 · renderedChars: 6600`));
  assert.ok(
    fixFirst.includes(
      `- \`${BLUE_HAT}\` — ratio: 0.09 · snippet: \`${snippet}\` · missing: — · agents: \`GPTBot\`, \`ClaudeBot\` · none: none`,
    ),
  );
});

test("renderReport: objects in evidence are written out in full as code", () => {
  const findings = healthyAccess({
    divergence: { status: "warn", evidence: { agents: ["Claude-User"], causes: { "Claude-User": "HTTP 403" } } },
  });

  assert.ok(section(report(findings), "Fix first").includes('causes: `{"Claude-User":"HTTP 403"}`'));
});

test("renderReport: a page-scope entry in a sampled run carries its template breakdown", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "render.text_coverage", status: "fail", url: RED_SHOE }),
  ];
  const fixFirst = section(report(findings, sampledCoverage), "Fix first");

  assert.ok(fixFirst.includes("- `/products/*` — 1 of 2 sampled (2,140 URLs in sitemap)"));
});

test("renderReport: a site-scope entry has no template breakdown", () => {
  const findings = healthyAccess({
    robots: { status: "warn", evidence: { robotsTxt: "parsed", statusCode: 200, blockedAgents: ["Googlebot"], blockedFromPage: [] } },
  });
  const fixFirst = section(report(findings, sampledCoverage), "Fix first");

  assert.ok(fixFirst.includes("robots.txt blocks AI agents"));
  assert.ok(!fixFirst.includes("Templates"));
});

test("renderReport: site text cannot break a table or the formatting", () => {
  const findings = [
    ...healthyAccess({
      divergence: {
        status: "warn",
        evidence: { agents: ["Claude-User"], causes: { "Claude-User": "HTTP 403" } },
      },
    }),
    findingFrom({
      criterionKey: "structure.link_navigation",
      status: "fail",
      url: "https://example.com/a|b",
      evidence: { anchor: "**bold** <script> `tick`", lines: "one\ntwo" },
    }),
  ];
  const markdown = report(findings, {
    ...sampledCoverage,
    sample: {
      ...sample,
      templates: [{ label: "/a|b", urls: ["https://example.com/a|b"], sampled: ["https://example.com/a|b"] }],
    },
  });

  // A pipe inside a table cell is escaped, so the row keeps its four cells.
  assert.ok(section(markdown, "Coverage").includes("| `/a\\|b` | 1 | 1 | `https://example.com/a\\|b` |"));
  // Backticks inside a value get a longer fence; a newline becomes a space.
  assert.ok(markdown.includes("anchor: `` **bold** <script> `tick` ``"));
  assert.ok(markdown.includes("lines: `one two`"));
});

test("renderReport: an unscored finding is an observation, never a Not checked entry", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "provenance.llms_txt", status: "skip", url: SITE, evidence: { reason: "fetch failed" } }),
  ];
  const markdown = report(findings);

  assert.ok(section(markdown, "Observations").includes("No llms.txt"));
  assert.ok(section(markdown, "Observations").includes("costs the site nothing"));
  assert.ok(!section(markdown, "Not checked").includes("No llms.txt"));
});

test("renderReport: Not checked groups each scored skip by criterion with its reason", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "render.text_coverage", status: "skip", url: RED_SHOE, evidence: { reason: "render failed" } }),
    findingFrom({ criterionKey: "render.text_coverage", status: "skip", url: BLUE_HAT, evidence: { reason: "raw fetch failed" } }),
  ];
  const notChecked = section(report(findings), "Not checked");

  assert.ok(notChecked.includes("### Content requires JavaScript (`render.text_coverage`)"));
  assert.ok(notChecked.includes(`- \`${RED_SHOE}\` — reason: \`render failed\``));
  assert.ok(notChecked.includes(`- \`${BLUE_HAT}\` — reason: \`raw fetch failed\``));
});

test("renderReport: with no skips, Not checked says so in one line", () => {
  assert.ok(section(report(healthyAccess()), "Not checked").includes("Every check ran."));
});

test("renderReport: passes appear nowhere as entries", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "render.images_missing_alt", status: "pass", url: RED_SHOE, evidence: { missing: 0 } }),
  ];

  assert.ok(!report(findings).includes("Images lack alt text"));
});

test("renderReport: the same input renders the same text", () => {
  const findings = [
    ...healthyAccess(),
    findingFrom({ criterionKey: "render.text_coverage", status: "fail", url: RED_SHOE }),
  ];

  assert.equal(report(findings, sampledCoverage), report(findings, sampledCoverage));
});
