import { rateLimitProbe } from "./rate-limit-probe.ts";
import { robotsAudit } from "./robots-audit.ts";
import {
  findBaselineMismatchedAgents,
  findPolicyDivergentAgents,
  humanCrawler,
  payPerCrawlDetected,
  userAgentProb,
} from "./ua-probe.ts";
import { hasSitemap, sitemapFreshness, sitemapInRobots } from "./sitemap.ts";

export async function runSectionAAudit(url: string) {
  const robotsAuditResult = await robotsAudit(url);

  //perform human and user agent crawls
  const humanBaseline = await humanCrawler(url);
  const uaProbeResults = await userAgentProb(robotsAuditResult.results, url);

  const policyDivergentAgents = findPolicyDivergentAgents(uaProbeResults);
  const payPerCrawl = payPerCrawlDetected(uaProbeResults);
  const baselineMismatchedAgents = findBaselineMismatchedAgents(humanBaseline, uaProbeResults);

  const rateLimit = await rateLimitProbe(url);
  const sitemapExists = await hasSitemap(url);
  const sitemapUrlsFromRobots = await sitemapInRobots(url);
  const freshness = await sitemapFreshness(url);

  return {
    robotsAuditResult,
    humanBaseline,
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
