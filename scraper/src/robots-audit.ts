import { RobotsTxtFile } from "crawlee";
import { AGENTS, type Agent, type RobotsAudit } from "./types.ts";

export async function robotsAudit(siteUrl: string): Promise<RobotsAudit> {
  const root = new URL("/", siteUrl).href;
  const robots = await RobotsTxtFile.find(root);

  return auditAgents(root, robots);
}


function auditAgents(root: string, robots: RobotsTxtFile): RobotsAudit {
  const results = Object.fromEntries(
    AGENTS.map((agent) => [agent, robots.isAllowed(root, agent)]),
  ) as Record<Agent, boolean>;
  const allowedCount = Object.values(results).filter(Boolean).length;

  return { results, passPercentage: (allowedCount / AGENTS.length) * 100 };
}
