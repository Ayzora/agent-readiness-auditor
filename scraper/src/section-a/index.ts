import { rateLimit, rateLimitProbe } from "./rate-limit-probe.ts";
import { robotsAllowsAgents, robotsAudit } from "./robots-audit.ts";
import {
  findBaselineMismatchedAgents,
  findPolicyDivergentAgents,
  payPerCrawlDetected,
  userAgentProb,
} from "./ua-probe.ts";
import {
  hasSitemap,
  sitemapFresh,
  sitemapFreshness,
  sitemapInRobots,
  sitemapPresent,
} from "./sitemap.ts";
import type { Finding, PageSnapshot, Rulebook } from "../types.ts";

export async function runSectionAAudit(
  url: string,
  snapshot: PageSnapshot,
  rulebook: Rulebook,
): Promise<Finding[]> {
  // Site-scope findings are keyed on the site root, not the audited page.
  const siteUrl = new URL("/", url).href;

  const robotsAuditResult = await robotsAudit(url);
  const uaProbeResults = await userAgentProb(robotsAuditResult.results, url);
  const rateLimitResult = await rateLimitProbe(url);
  const sitemapExists = await hasSitemap(url);
  const sitemapUrlsFromRobots = await sitemapInRobots(url);
  const freshness = await sitemapFreshness(
    sitemapUrlsFromRobots[0] ?? new URL("/sitemap.xml", url).href,
  );

  return [
    robotsAllowsAgents(siteUrl, robotsAuditResult),
    findPolicyDivergentAgents(url, uaProbeResults),
    payPerCrawlDetected(url, uaProbeResults),
    findBaselineMismatchedAgents(url, snapshot.rawHtml, uaProbeResults, rulebook),
    rateLimit(siteUrl, rateLimitResult),
    sitemapPresent(siteUrl, sitemapExists, sitemapUrlsFromRobots),
    sitemapFresh(siteUrl, sitemapExists, freshness, rulebook),
  ];
}
