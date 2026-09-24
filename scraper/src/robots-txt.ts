import robotsParserModule from "robots-parser";
import type { Agent, RobotsTxtCapture } from "./types.ts";

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
// Phase 1 calls this too: for the Sitemap: lines, and for which agents to probe.
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
