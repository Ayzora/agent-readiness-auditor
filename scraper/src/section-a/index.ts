import { rateLimitProbe } from "./rate-limit-probe.ts";
import { robotsAudit } from "./robots-audit.ts";
import {
  findBaselineMismatchedAgents,
  findPolicyDivergentAgents,
  payPerCrawlDetected,
  userAgentProb,
} from "./ua-probe.ts";
import { hasSitemap, sitemapFreshness, sitemapInRobots } from "./sitemap.ts";
import type { PageSnapshot } from "../types.ts";

export async function runSectionAAudit(url: string, snapshot: PageSnapshot) {
  const robotsAuditResult = await robotsAudit(url);

  const uaProbeResults = await userAgentProb(robotsAuditResult.results, url);

  const policyDivergentAgents = findPolicyDivergentAgents(uaProbeResults);
  const payPerCrawl = payPerCrawlDetected(uaProbeResults);
  const baselineMismatchedAgents = findBaselineMismatchedAgents(snapshot.rawHtml, uaProbeResults);

  const rateLimit = await rateLimitProbe(url);
  const sitemapExists = await hasSitemap(url);
  const sitemapUrlsFromRobots = await sitemapInRobots(url);
  const freshness = await sitemapFreshness(url);

  return {
    robotsAuditResult,
    uaProbeResults,
    policyDivergentAgents,
    payPerCrawl,
    baselineMismatchedAgents,
    rateLimit,
    sitemapExists,
    sitemapUrlsFromRobots,
    freshness,
  };
}
