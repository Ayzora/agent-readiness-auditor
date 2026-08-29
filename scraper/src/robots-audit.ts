import { RobotsTxtFile } from "crawlee";

const AGENTS = [
  // User-initiated agents
  "ChatGPT-User",
  "Claude-User",
  "Perplexity-User",
  "MistralAI-User",
  "Meta-ExternalFetcher",
  "Amzn-User",
  "Google-Agent",
  // Index / search bots
  "OAI-SearchBot",
  "Claude-SearchBot",
  "xSeek",
  "PerplexityBot",
  "DuckAssistBot",
  "MistralAI-Index",
  "Amzn-SearchBot",
  "Bingbot",
  "Googlebot",
] as const;

export type Agent = (typeof AGENTS)[number];

export interface RobotsAudit {
  results: Record<Agent, boolean>;
  passPercentage: number;
}

/**
 * Check which agents robots.txt lets through to the site root.
 *
 * @param siteUrl any URL on the site to audit
 */
export async function robotsAudit(siteUrl: string): Promise<RobotsAudit> {
  const root = new URL("/", siteUrl).href;
  const robots = await RobotsTxtFile.find(root);

  return auditAgents(root, robots);
}

/**
 * Same audit against robots.txt content you already have, so callers (and
 * tests) can skip the network request.
 *
 * @param siteUrl any URL on the site to audit
 * @param content the contents of that site's robots.txt
 */
export function robotsAuditFrom(siteUrl: string, content: string): RobotsAudit {
  const root = new URL("/", siteUrl).href;
  const robots = RobotsTxtFile.from(new URL("/robots.txt", siteUrl).href, content);

  return auditAgents(root, robots);
}

function auditAgents(root: string, robots: RobotsTxtFile): RobotsAudit {
  const results = Object.fromEntries(
    AGENTS.map((agent) => [agent, robots.isAllowed(root, agent)]),
  ) as Record<Agent, boolean>;
  const allowedCount = Object.values(results).filter(Boolean).length;

  return { results, passPercentage: (allowedCount / AGENTS.length) * 100 };
}
