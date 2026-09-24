import test from "node:test";
import assert from "node:assert/strict";
import { accessFrom } from "../utils.ts";
import { AGENTS, type FindingStatus, type RobotsTxtCapture } from "../types.ts";
import { agentsToProbe, robotsAllowsAgents } from "./robots.ts";

const PAGE_URL = "https://test.invalid/docs/guide";
const SITE_ROOT = "https://test.invalid/";

const robotsTxt = (overrides: Partial<RobotsTxtCapture>): RobotsTxtCapture => ({
  ...accessFrom().robots,
  ...overrides,
});

const NOT_EVERY_AGENT = AGENTS.filter((agent) => agent !== "Googlebot");

const verdictCases: {
  name: string;
  capture: RobotsTxtCapture;
  status: FindingStatus;
  evidence: Record<string, unknown>;
}[] = [
  {
    name: "a 200 allowing every agent",
    capture: robotsTxt({ body: "User-agent: *\nAllow: /\n" }),
    status: "pass",
    evidence: { robotsTxt: "parsed", blockedAgents: [] },
  },
  {
    name: "a 200 blocking some agents",
    capture: robotsTxt({ body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: Claude-User\nDisallow: /\n" }),
    status: "warn",
    evidence: { blockedAgents: ["Claude-User"] },
  },
  {
    name: "a 200 blocking every agent",
    capture: robotsTxt({ body: "User-agent: *\nDisallow: /\n" }),
    status: "fail",
    evidence: { blockedAgents: [...AGENTS] },
  },
  {
    name: "a 404, so no rules",
    capture: robotsTxt({ statusCode: 404, body: "Not Found" }),
    status: "pass",
    evidence: { robotsTxt: "unavailable", blockedAgents: [] },
  },
  {
    name: "a 403, so no rules",
    capture: robotsTxt({ statusCode: 403, body: "Forbidden" }),
    status: "pass",
    evidence: { robotsTxt: "unavailable", blockedAgents: [] },
  },
  {
    name: "a 500, so every agent disallowed",
    capture: robotsTxt({ statusCode: 500, body: "Internal Server Error" }),
    status: "fail",
    evidence: { robotsTxt: "unreachable", statusCode: 500 },
  },
  {
    name: "no answer, so every agent disallowed",
    capture: robotsTxt({ statusCode: null, body: null, error: "getaddrinfo ENOTFOUND test.invalid" }),
    status: "fail",
    evidence: { robotsTxt: "unreachable", error: "getaddrinfo ENOTFOUND test.invalid" },
  },
  {
    name: "a folder closed to one agent is judged at the root",
    capture: robotsTxt({ body: "User-agent: *\nAllow: /\n\nUser-agent: Claude-User\nDisallow: /docs/\n" }),
    status: "pass",
    evidence: { blockedAgents: [], blockedFromPage: ["Claude-User"] },
  },
];

for (const { name, capture, status, evidence } of verdictCases) {
  test(`robots_allows_agents: ${name} -> ${status}`, () => {
    const finding = robotsAllowsAgents(PAGE_URL, capture);

    assert.equal(finding.criterionKey, "access.robots_allows_agents");
    assert.equal(finding.url, SITE_ROOT);
    assert.equal(finding.status, status);
    for (const [key, expected] of Object.entries(evidence)) {
      assert.deepEqual(finding.evidence[key], expected, `evidence.${key}`);
    }
  });
}

const probeCases: { name: string; capture: RobotsTxtCapture; agents: readonly string[] }[] = [
  {
    name: "an agent disallowed on the audited page's path is excluded",
    capture: robotsTxt({ body: "User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /docs/\n" }),
    agents: NOT_EVERY_AGENT,
  },
  {
    name: "an agent disallowed only elsewhere is included",
    capture: robotsTxt({ body: "User-agent: Googlebot\nDisallow: /private/\n" }),
    agents: AGENTS,
  },
  {
    name: "a 4xx robots.txt probes every agent",
    capture: robotsTxt({ statusCode: 404, body: "Not Found" }),
    agents: AGENTS,
  },
  {
    name: "a 5xx robots.txt probes none",
    capture: robotsTxt({ statusCode: 503, body: "Service Unavailable" }),
    agents: [],
  },
];

for (const { name, capture, agents } of probeCases) {
  test(`agents to probe: ${name}`, () => {
    assert.deepEqual(agentsToProbe(capture, PAGE_URL), agents);
  });
}
