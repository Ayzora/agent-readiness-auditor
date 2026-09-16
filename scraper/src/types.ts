import type { IncomingHttpHeaders } from "node:http";

export const AGENTS = [
  "ChatGPT-User",
  "Claude-User",
  "Perplexity-User",
  "MistralAI-User",
  "Meta-ExternalFetcher",
  "Amzn-User",
  "Google-Agent",
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

export type FindingStatus = "pass" | "fail" | "warn" | "skip";

// `skip` means the check could not run; it is excluded from scoring, not counted as pass or fail.
export interface Finding {
  criterionKey: string;
  url: string;
  status: FindingStatus;
  evidence: Record<string, unknown>;
}

export interface Criterion {
  key: string;
  dimension: string;
  scope: "page" | "site";
  weight: number;
  severity: "critical" | "high" | "medium" | "low";
  effort: "S" | "M" | "L";
  title: string;
  why: string;
  fix: string;
  thresholds?: Record<string, number>;
}

export interface Gate {
  criterion: string;
  cap: number;
  reason: string;
}

export interface Rulebook {
  version: string;
  criteria: Criterion[];
  gates: Gate[];
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

// A step is null when the time budget ran out before it started.
export interface InteractionCapture {
  hidden: HiddenTextCapture;
  consent: ConsentCapture | null;
  loadMore: LoadMoreCapture | null;
  scroll: ScrollCapture | null;
  clicks: number;
  elapsedMs: number;
}

// A 200 means the site soft-404s; `fingerprint` is its error page's text.
export interface Soft404Probe {
  probeUrl: string;
  statusCode: number | null;
  fingerprint: string | null;
  error: string | null;
}
