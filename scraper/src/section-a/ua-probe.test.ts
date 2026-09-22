import test from "node:test";
import assert from "node:assert/strict";
import type { AgentsProbeResult, FindingStatus } from "../types.ts";
import { findPolicyDivergentAgents } from "./ua-probe.ts";

const URL = "https://test.invalid/page";

const welcomed = (userAgent: AgentsProbeResult["userAgent"]): AgentsProbeResult => ({
  userAgent,
  statusCode: 200,
  htmlContent: "<html></html>",
  isChallenged: false,
});

const cases: {
  name: string;
  probes: AgentsProbeResult[];
  status: FindingStatus;
  agents?: string[];
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
      { ...welcomed("ChatGPT-User"), isChallenged: true },
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
];

for (const { name, probes, status, agents } of cases) {
  test(name, () => {
    const finding = findPolicyDivergentAgents(URL, probes);

    assert.equal(finding.status, status);
    if (agents) assert.deepEqual(finding.evidence.agents, agents);
  });
}
