import test from "node:test";
import assert from "node:assert/strict";
import { loadRulebook } from "../rulebook.ts";
import type { AgentProbe, FindingStatus } from "../types.ts";
import {
  findBaselineMismatchedAgents,
  findPolicyDivergentAgents,
  payPerCrawlDetected,
  probeOutcome,
  type AgentProbeOutcome,
} from "./agent-probes.ts";

const rulebook = loadRulebook();

const URL = "https://test.invalid/page";

const BASELINE_HTML = "<html><body><p>Welcome to the test site, where every agent is served.</p></body></html>";

const welcomed = (agent: AgentProbe["agent"]): AgentProbe => ({
  agent,
  statusCode: 200,
  challenged: false,
  body: BASELINE_HTML,
  error: null,
});

const noAnswer = (agent: AgentProbe["agent"]): AgentProbe => ({
  ...welcomed(agent),
  statusCode: null,
  body: null,
  error: "Timeout awaiting 'request' for 15000ms",
});

const outcomeCases: { name: string; probe: AgentProbe; outcome: AgentProbeOutcome }[] = [
  { name: "200", probe: welcomed("Claude-User"), outcome: "got through" },
  { name: "200 challenged", probe: { ...welcomed("Claude-User"), challenged: true }, outcome: "blocked" },
  { name: "402", probe: { ...welcomed("Claude-User"), statusCode: 402 }, outcome: "asked to pay" },
  { name: "403", probe: { ...welcomed("Claude-User"), statusCode: 403 }, outcome: "blocked" },
  { name: "503", probe: { ...welcomed("Claude-User"), statusCode: 503 }, outcome: "blocked" },
  { name: "an error with no status", probe: noAnswer("Claude-User"), outcome: "no answer" },
];

for (const { name, probe, outcome } of outcomeCases) {
  test(`probe outcome: ${name} -> ${outcome}`, () => {
    assert.equal(probeOutcome(probe), outcome);
  });
}

const divergenceCases: {
  name: string;
  probes: AgentProbe[];
  status: FindingStatus;
  agents?: string[];
  causes?: Record<string, string>;
}[] = [
  {
    name: "no probed agent blocked passes",
    probes: [welcomed("ChatGPT-User"), welcomed("Claude-User")],
    status: "pass",
    agents: [],
  },
  {
    name: "some probed agents blocked warns",
    probes: [welcomed("ChatGPT-User"), { ...welcomed("Claude-User"), statusCode: 403 }],
    status: "warn",
    agents: ["Claude-User"],
  },
  {
    name: "every probed agent blocked fails",
    probes: [
      { ...welcomed("ChatGPT-User"), challenged: true },
      { ...welcomed("Claude-User"), statusCode: 503 },
    ],
    status: "fail",
    agents: ["ChatGPT-User", "Claude-User"],
  },
  {
    name: "no agent allowed to probe skips",
    probes: [],
    status: "skip",
  },
  {
    name: "an agent with no answer counts as blocked",
    probes: [welcomed("ChatGPT-User"), noAnswer("Claude-User")],
    status: "warn",
    agents: ["Claude-User"],
  },
  {
    name: "an agent asked to pay is not counted",
    probes: [welcomed("ChatGPT-User"), { ...welcomed("Claude-User"), statusCode: 402 }],
    status: "pass",
    agents: [],
  },
  {
    name: "every agent with no answer fails",
    probes: [noAnswer("ChatGPT-User"), noAnswer("Claude-User")],
    status: "fail",
    agents: ["ChatGPT-User", "Claude-User"],
  },
  {
    name: "the cause is recorded per agent",
    probes: [
      { ...welcomed("ChatGPT-User"), challenged: true },
      { ...welcomed("Claude-User"), statusCode: 503 },
      noAnswer("PerplexityBot"),
      welcomed("Googlebot"),
    ],
    status: "warn",
    causes: {
      "ChatGPT-User": "challenged",
      "Claude-User": "HTTP 503",
      PerplexityBot: "Timeout awaiting 'request' for 15000ms",
    },
  },
];

for (const { name, probes, status, agents, causes } of divergenceCases) {
  test(`policy_divergence: ${name}`, () => {
    const finding = findPolicyDivergentAgents(URL, probes);

    assert.equal(finding.status, status);
    if (agents) assert.deepEqual(finding.evidence.agents, agents);
    if (causes) assert.deepEqual(finding.evidence.causes, causes);
  });
}

const payCases: { name: string; probes: AgentProbe[]; status: FindingStatus; agents?: string[] }[] = [
  {
    name: "an agent asked to pay warns",
    probes: [welcomed("ChatGPT-User"), { ...welcomed("Claude-User"), statusCode: 402 }],
    status: "warn",
    agents: ["Claude-User"],
  },
  {
    name: "no agent asked to pay passes",
    probes: [welcomed("ChatGPT-User"), { ...welcomed("Claude-User"), statusCode: 403 }],
    status: "pass",
    agents: [],
  },
  { name: "no agent probed skips", probes: [], status: "skip" },
];

for (const { name, probes, status, agents } of payCases) {
  test(`pay_per_crawl: ${name}`, () => {
    const finding = payPerCrawlDetected(URL, probes);

    assert.equal(finding.status, status);
    if (agents) assert.deepEqual(finding.evidence.agents, agents);
  });
}

const baselineCases: {
  name: string;
  probes: AgentProbe[];
  status: FindingStatus;
  evidence: Record<string, unknown>;
}[] = [
  {
    name: "a blocked agent's empty body is not compared",
    probes: [welcomed("ChatGPT-User"), { ...welcomed("Claude-User"), statusCode: 403, body: "" }],
    status: "pass",
    evidence: { agents: [] },
  },
  {
    name: "no agent got through skips",
    probes: [{ ...welcomed("ChatGPT-User"), statusCode: 403, body: "" }, noAnswer("Claude-User")],
    status: "skip",
    evidence: { reason: "no agent got through" },
  },
  {
    name: "no agent probed skips",
    probes: [],
    status: "skip",
    evidence: { reason: "no agents allowed to probe" },
  },
  {
    name: "an agent that got through with different text fails",
    probes: [welcomed("ChatGPT-User"), { ...welcomed("Claude-User"), body: "<html><body><p>Hi</p></body></html>" }],
    status: "fail",
    evidence: { agents: [{ agent: "Claude-User", agentTextLength: 2 }] },
  },
];

for (const { name, probes, status, evidence } of baselineCases) {
  test(`baseline_mismatch: ${name}`, () => {
    const finding = findBaselineMismatchedAgents(URL, BASELINE_HTML, probes, rulebook);

    assert.equal(finding.status, status);
    for (const [key, expected] of Object.entries(evidence)) {
      assert.deepEqual(finding.evidence[key], expected, `evidence.${key}`);
    }
  });
}

test("baseline_mismatch: a baseline with no text skips", () => {
  const finding = findBaselineMismatchedAgents(URL, "<html><body></body></html>", [welcomed("Claude-User")], rulebook);

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "baseline has no text");
});
