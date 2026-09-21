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
  scored?: boolean;
  dimension: string;
  scope: "page" | "site" | "document";
  weight?: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  effort: "S" | "M" | "L";
  title: string;
  why: string;
  fix: string;
  thresholds?: Record<string, number>;
  // semantics.required_properties only: type name -> the property paths it must carry.
  required_properties?: Record<string, string[]>;
  // documents.html_equivalent only: the terms that make a linked document a key document.
  key_topics?: string[];
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

export interface JsonLdEntity {
  // Every normalised @type this entity declares; an array declares several.
  types: string[];
  value: Record<string, unknown>;
}

export interface JsonLdBlockError {
  index: number;
  message: string;
}

// What one page's JSON-LD blocks amount to. All three Section D checks read this,
// so no two of them can disagree about what the page declares.
export interface PageJsonLd {
  blockCount: number;
  parsedCount: number;
  entities: JsonLdEntity[];
  declaredTypes: string[];
  errors: JsonLdBlockError[];
}

// A 200 means the site soft-404s; `fingerprint` is its error page's text.
export interface Soft404Probe {
  probeUrl: string;
  statusCode: number | null;
  fingerprint: string | null;
  error: string | null;
}

// One linked document the probe attempted. Fields go null and `error` is populated
// rather than throwing, so one dead document cannot cost the run the other nine.
export interface DocumentCapture {
  url: string;
  anchorText: string | null;
  // Every page this run that linked it; the document is fetched and judged once.
  linkedFrom: string[];
  isKeyDocument: boolean;
  keyTopic: string | null;
  statusCode: number | null;
  finalUrl: string | null;
  contentType: string | null;
  bytes: number | null;
  // false when the probe chose not to fetch: over the size ceiling, or out of budget.
  fetched: boolean;
  // Decided by the leading %PDF- bytes, never by the extension or the header.
  isPdf: boolean;
  text: string | null;
  pageCount: number | null;
  isTagged: boolean | null;
  taggedBy: "markInfo" | "structTree" | null;
  error: string | null;
}

// `discovered` counts every candidate found, so a report never implies the
// capped fetch list was all of them.
export interface DocumentProbe {
  discovered: number;
  offDomain: number;
  documents: DocumentCapture[];
}


export interface LlmsTxtCapture {
  url: string, 
  statusCode: number | null, 
  contentType: string | null, 
  body: string | null, 
  bytes: number | null, 
  error: string | null
 }