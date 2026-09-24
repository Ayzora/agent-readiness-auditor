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

// The one fetch of /robots.txt. Its body is parsed by the checks, not here,
// so a test can pass a robots.txt as a string.
export interface RobotsTxtCapture {
  url: string;
  statusCode: number | null;
  body: string | null;
  error: string | null;
}

// One request for the audited page under an agent's user-agent string.
// `statusCode` is null when no answer arrived, and `error` then says why.
export interface AgentProbe {
  agent: Agent;
  statusCode: number | null;
  challenged: boolean;
  body: string | null;
  error: string | null;
}

export type RateLimitStop = "429" | "retry-after" | "no answer";

// Both null when the ramp completed without meeting a limit.
export interface RateLimitCapture {
  limitFoundAt: number | null;
  stoppedBy: RateLimitStop | null;
  // Why the request that stopped the ramp got no answer.
  error: string | null;
}

export interface SitemapFetch {
  url: string;
  statusCode: number | null;
  body: string | null;
  error: string | null;
}

// Everything Section A fetches, once per run. Fields go null and `error` is
// populated rather than throwing, so one dead fetch costs only its own findings.
export interface AccessCapture {
  robots: RobotsTxtCapture;
  // Only the agents robots.txt allows on the audited page, one probe each.
  agentProbes: AgentProbe[];
  rateLimit: RateLimitCapture;
  // "robots.txt" when its Sitemap: lines were tried, in order until one loaded;
  // "default" when it listed none and /sitemap.xml was tried instead.
  sitemaps: { source: "robots.txt" | "default"; fetches: SitemapFetch[] };
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
  // warn_credit: the share of a criterion's weight a warn earns.
  defaults: { warn_credit: number };
  criteria: Criterion[];
  gates: Gate[];
}

// A dimension whose criteria are all unscored is observational: it never has a
// score and is never counted as N/A. Otherwise `score` is null when nothing in
// it was available to earn, which is N/A, never 0.
export interface DimensionScore {
  dimension: string;
  observational: boolean;
  // Unrounded, so the total is not built from rounded parts.
  score: number | null;
  findingCount: number;
}

// Carries no prose: a gate's reason is read from the rulebook when printed.
export interface FiredGate {
  criterion: string;
  cap: number;
}

export interface FixFirstEntry {
  criterionKey: string;
  // Every url with a finding that cost points: a page, the site root or a document.
  subjects: string[];
  roi: number;
}

// What one audit's findings amount to under the rulebook. Keys and numbers
// only; titles, why and fix text are looked up when it is printed.
export interface Scorecard {
  dimensions: DimensionScore[];
  // Both null when the total is withheld; equal when no gate lowered it.
  total: number | null;
  uncappedTotal: number | null;
  withheld: "access-not-measured" | null;
  // Non-observational dimensions that were N/A while a total was computed.
  leftOut: string[];
  // Every gate that fired, not only the one that bound.
  gates: FiredGate[];
  fixFirst: FixFirstEntry[];
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