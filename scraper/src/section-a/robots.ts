import robotsParserModule from "robots-parser";
import { AGENTS, type Agent, type Finding, type RobotsTxtCapture } from "../types.ts";

// The package is CommonJS whose module.exports is the parser itself, but its
// types declare an ES default export, so the default import needs retyping.
const robotsParser = robotsParserModule as unknown as typeof robotsParserModule.default;

// RFC 9309's names for the three ways a robots.txt fetch can end.
export type RobotsTxtState = "parsed" | "unavailable" | "unreachable";

export interface RobotsRules {
  state: RobotsTxtState;
  isAllowed(agent: Agent, url: string): boolean;
  sitemaps: string[];
}

// Per RFC 9309: a 4xx means no rules, so every agent is allowed, as does a 3xx
// still standing after redirects were followed; a 5xx or no answer means every
// agent is disallowed, because that is what agents do.
// Phase 1 calls this too, to decide which agents to probe.
export function readRobots(capture: RobotsTxtCapture): RobotsRules {
  const { statusCode, body } = capture;

  if (statusCode === null || statusCode >= 500) {
    return { state: "unreachable", isAllowed: () => false, sitemaps: [] };
  }
  if (statusCode >= 300) {
    return { state: "unavailable", isAllowed: () => true, sitemaps: [] };
  }

  const robots = robotsParser(capture.url, body ?? "");
  return {
    state: "parsed",
    // undefined means the URL is on another host, which robots.txt has no say over.
    isAllowed: (agent, url) => robots.isAllowed(url, agent) ?? true,
    sitemaps: robots.getSitemaps(),
  };
}

// Only agents robots.txt lets onto the audited page are probed, so a folder it
// closes cannot be charged to the server for refusing them.
export function agentsToProbe(capture: RobotsTxtCapture, pageUrl: string): Agent[] {
  const rules = readRobots(capture);
  return AGENTS.filter((agent) => rules.isAllowed(agent, pageUrl));
}

// Judged at the site root, because the cap-20 gate asks whether the site has
// shut agents out; one closed folder must not cap the whole site.
export function robotsAllowsAgents(
  url: string,
  capture: RobotsTxtCapture,
): Finding {
  const siteRoot = new URL("/", url).href;
  const rules = readRobots(capture);

  const blockedAgents = AGENTS.filter((agent) => !rules.isAllowed(agent, siteRoot));
  const blockedFromPage = AGENTS.filter((agent) => !rules.isAllowed(agent, url));
  const status =
    blockedAgents.length === 0 ? "pass" : blockedAgents.length === AGENTS.length ? "fail" : "warn";

  return {
    criterionKey: "access.robots_allows_agents",
    url: siteRoot,
    status,
    evidence: {
      robotsTxt: rules.state,
      statusCode: capture.statusCode,
      ...(capture.error ? { error: capture.error } : {}),
      blockedAgents,
      blockedFromPage,
    },
  };
}
