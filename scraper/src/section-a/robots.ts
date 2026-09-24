import { readRobots } from "../robots-txt.ts";
import { AGENTS, type Agent, type Finding, type RobotsTxtCapture } from "../types.ts";

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
