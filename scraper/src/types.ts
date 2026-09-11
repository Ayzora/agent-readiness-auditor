import type { IncomingHttpHeaders } from "node:http";

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

export type FindingStatus = "pass" | "fail" | "warn" | "skip";

// One check, one page, one outcome. Weight, severity, title and fix text are
// deliberately absent: those come from the rulebook (criteria.yaml), so checks
// are not blocked on it existing. `skip` means the check could not run and is
// excluded from scoring entirely — not a pass, which inflates, and not a fail,
// which defames.
export interface Finding {
  criterionKey: string;
  url: string;
  status: FindingStatus;
  // The measured values the verdict rests on, so a report can state "812
  // characters without JavaScript, 9,440 with" rather than only "fail".
  evidence: Record<string, unknown>;
}


export type RenderSettled = "networkidle" | "load-timeout";

export interface PageSnapshot {
  url: string;
  resolvedUrl: string | null;
  rawHtml: string | null;
  renderedHtml: string | null;
  visibleText: string | null;
  domText: string | null;
  statusCode: number | null;
  headers: IncomingHttpHeaders | null;
  redirectChain: string[];
  browserFinalUrl: string | null;
  renderSettled: RenderSettled | null;
  timing: { rawMs: number | null; renderedMs: number | null };
  error: string | null;
}

// Measured with zero clicks: the text CSS leaves visible against all text in
// the DOM, from one walk of the live page so both sides are extracted the same
// way. A text-parsing agent reads the hidden part perfectly well.
export interface HiddenTextCapture {
  visibleChars: number;
  domChars: number;
}

export interface ConsentCapture {
  bannerFound: boolean;
  accepted: boolean;
  controlText: string | null;
  // Both exclude the banner's own text, so the difference is what consent gated.
  charsBefore: number | null;
  charsAfter: number | null;
}

export interface LoadMoreCapture {
  controlFound: boolean;
  clicked: boolean;
  controlText: string | null;
  charsBefore: number | null;
  charsAfter: number | null;
}

export interface ScrollCapture {
  scrolls: number;
  charsBefore: number;
  charsAfter: number;
}

// What the allowlisted interactions revealed on the snapshot's page. Character
// counts are extractText over the live DOM, comparable with the snapshot's
// domText. A step is null when the budget ran out before it could start — the
// checks reading it skip rather than guess.
export interface InteractionCapture {
  hidden: HiddenTextCapture;
  consent: ConsentCapture | null;
  loadMore: LoadMoreCapture | null;
  scroll: ScrollCapture | null;
  clicks: number;
  elapsedMs: number;
}
