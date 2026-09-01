export const AGENTS = [
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

export interface RateLimitProbe {
  passed: boolean;
  limitFoundAt: number | null;
}



  export interface SitemapFreshness {
    mostRecentLastmod: string | null;
    daysSinceMostRecent: number | null;
}


export interface ProbeResult{
  htmlContent: string | null;
  statusCode: number | null;
  isChallenged: boolean | null;

}

export interface AgentsProbeResult extends ProbeResult {
  userAgent: Agent;
}

export interface PayPerCrawlFinding {
  detected: boolean;
  agents: Agent[];
}

export interface PolicyDivergenceFinding {
  agents: Agent[];
}

export interface BaselineMisMatch {
  mismatchedAgents: Agent;
  baselineHtml: string | null; 
  agentUaHtml: string | null;
}