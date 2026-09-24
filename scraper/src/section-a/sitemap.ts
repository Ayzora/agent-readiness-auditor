import { sitemapLoads } from "../site-sample.ts";
import type { Finding, Rulebook, SitemapCapture, SitemapFetch } from "../types.ts";
import { skipped, thresholdsFor } from "../utils.ts";

function whyNotLoaded(fetch: SitemapFetch): string {
  if (fetch.statusCode === null) return fetch.error ?? "no answer";
  return fetch.statusCode === 200 ? "not a sitemap" : `HTTP ${fetch.statusCode}`;
}

export function sitemapPresent(url: string, sitemaps: SitemapCapture): Finding {
  const loaded = sitemaps.fetches.find(sitemapLoads) ?? null;
  const listedInRobots = sitemaps.source === "robots.txt";
  const status = loaded ? (listedInRobots ? "pass" : "warn") : "fail";

  return {
    criterionKey: "access.sitemap_present",
    url,
    status,
    evidence: {
      listedInRobots,
      loaded: loaded?.url ?? null,
      notLoaded: sitemaps.fetches
        .filter((fetch) => !sitemapLoads(fetch))
        .map((fetch) => ({ url: fetch.url, why: whyNotLoaded(fetch) })),
    },
  };
}

export function sitemapFresh(
  url: string,
  sitemaps: SitemapCapture,
  rulebook: Rulebook,
): Finding {
  const criterionKey = "access.sitemap_freshness";
  const { warn } = thresholdsFor(rulebook, criterionKey);

  const loaded = sitemaps.fetches.find(sitemapLoads);
  if (!loaded) return skipped(criterionKey, url, "no sitemap");

  const dates = [...loaded.body!.matchAll(/<lastmod>(.*?)<\/lastmod>/g)]
    .map((match) => new Date(match[1]))
    .filter((date) => !isNaN(date.getTime()));

  if (dates.length === 0) return skipped(criterionKey, url, "no readable lastmod");

  const mostRecent = new Date(Math.max(...dates.map((date) => date.getTime())));
  const daysSinceMostRecent = Math.floor((Date.now() - mostRecent.getTime()) / 86_400_000);

  return {
    criterionKey,
    url,
    status: daysSinceMostRecent > warn ? "warn" : "pass",
    evidence: { sitemap: loaded.url, mostRecentLastmod: mostRecent.toISOString(), daysSinceMostRecent },
  };
}
