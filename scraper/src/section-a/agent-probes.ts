import type { AgentProbe, Finding, Rulebook } from "../types.ts";
import { extractText } from "../extract-text.ts";
import { skipped, thresholdsFor } from "../utils.ts";

export type AgentProbeOutcome = "got through" | "asked to pay" | "blocked" | "no answer";

// Every probe lands in exactly one outcome, and each check reads only the
// outcomes it is about, so no single refusal is charged twice.
export function probeOutcome(probe: AgentProbe): AgentProbeOutcome {
  if (probe.statusCode === null) return "no answer";
  if (probe.statusCode === 402) return "asked to pay";
  if (probe.challenged || probe.statusCode >= 400) return "blocked";
  return "got through";
}

function causeOf(probe: AgentProbe): string {
  if (probe.challenged) return "challenged";
  return probe.statusCode === null ? (probe.error ?? "no answer") : `HTTP ${probe.statusCode}`;
}

const NO_PROBES = "no agents allowed to probe";

// 402 is a deliberate choice, not a misconfiguration, so it warns.
export function payPerCrawlDetected(url: string, probes: AgentProbe[]): Finding {
  if (probes.length === 0) return skipped("access.pay_per_crawl", url, NO_PROBES);

  const agents = probes
    .filter((probe) => probeOutcome(probe) === "asked to pay")
    .map((probe) => probe.agent);

  return { criterionKey: "access.pay_per_crawl", url, status: agents.length > 0 ? "warn" : "pass", evidence: { agents } };
}

// Fails only when every probed agent was blocked, so one minor crawler
// cannot trip the gate that caps the whole site. Dropping the connection is a
// real way to refuse an agent, so no answer counts as blocked.
export function findPolicyDivergentAgents(url: string, probes: AgentProbe[]): Finding {
  if (probes.length === 0) return skipped("access.policy_divergence", url, NO_PROBES);

  const refused = probes.filter((probe) => {
    const outcome = probeOutcome(probe);
    return outcome === "blocked" || outcome === "no answer";
  });
  const agents = refused.map((probe) => probe.agent);
  const causes = Object.fromEntries(refused.map((probe) => [probe.agent, causeOf(probe)]));

  const status = agents.length === 0 ? "pass" : agents.length === probes.length ? "fail" : "warn";

  return { criterionKey: "access.policy_divergence", url, status, evidence: { agents, causes } };
}

// Only agents that got through are compared: a blocked agent's empty body is
// policy_divergence's problem, not a content difference.
export function findBaselineMismatchedAgents(
  url: string,
  baselineRawHtml: string | null,
  probes: AgentProbe[],
  rulebook: Rulebook,
): Finding {
  const { fail } = thresholdsFor(rulebook, "access.baseline_mismatch");

  if (probes.length === 0) return skipped("access.baseline_mismatch", url, NO_PROBES);

  const through = probes.filter((probe) => probeOutcome(probe) === "got through");
  if (through.length === 0) return skipped("access.baseline_mismatch", url, "no agent got through");

  const baselineTextLength = extractText(baselineRawHtml).length;

  if (baselineTextLength === 0) {
    return skipped("access.baseline_mismatch", url, "baseline has no text");
  }

  const agents = through
    .map((probe) => ({ agent: probe.agent, agentTextLength: extractText(probe.body).length }))
    .filter(({ agentTextLength }) =>
      Math.abs(agentTextLength - baselineTextLength) / baselineTextLength > fail);

  return {
    criterionKey: "access.baseline_mismatch",
    url,
    status: agents.length > 0 ? "fail" : "pass",
    evidence: { baselineTextLength, agents },
  };
}
