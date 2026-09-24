import { captureAccess } from "./capture.ts";
import { robotsAllowsAgents } from "./robots.ts";
import {
  findBaselineMismatchedAgents,
  findPolicyDivergentAgents,
  payPerCrawlDetected,
} from "./agent-probes.ts";
import { rateLimit } from "./rate-limit.ts";
import { sitemapFresh, sitemapPresent } from "./sitemap.ts";
import type { AccessCapture, Finding, PageSnapshot, Rulebook } from "../types.ts";

export async function runSectionAAudit(
  url: string,
  snapshot: PageSnapshot,
  rulebook: Rulebook,
): Promise<Finding[]> {
  const capture = await captureAccess(url);

  return judgeAccess(url, capture, snapshot.rawHtml, rulebook);
}

// Synchronous on purpose, like Sections B–F: it cannot fetch, so a test builds
// an access capture literal and needs no network.
export function judgeAccess(
  url: string,
  capture: AccessCapture,
  baselineRawHtml: string | null,
  rulebook: Rulebook,
): Finding[] {
  // Site-scope findings are keyed on the site root, not the audited page.
  const siteUrl = new URL("/", url).href;

  return [
    robotsAllowsAgents(url, capture.robots),
    findPolicyDivergentAgents(url, capture.agentProbes),
    payPerCrawlDetected(url, capture.agentProbes),
    findBaselineMismatchedAgents(url, baselineRawHtml, capture.agentProbes, rulebook),
    rateLimit(siteUrl, capture.rateLimit),
    sitemapPresent(siteUrl, capture.sitemaps),
    sitemapFresh(siteUrl, capture.sitemaps, rulebook),
  ];
}
