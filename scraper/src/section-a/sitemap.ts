import { RobotsTxtFile } from "crawlee";
import { type Finding, type SitemapFreshness } from "../types.ts";
import { skipped } from "../utils.ts";

const SITEMAP_STALE_DAYS = 90;




export async function sitemapInRobots(url: string): Promise<string[]> {
    const root = new URL("/", url).href;
    try {
        const robots = await RobotsTxtFile.find(root);
        return robots.getSitemaps({ enqueueStrategy: "all" });
    } catch {
        return [];
    }
}

export async function hasSitemap(url: string): Promise<boolean> {

    //first check if there are in returned sitemaps from sitemapInRobots
    const sitemapsInRobots = await sitemapInRobots(url);
    if (sitemapsInRobots.length > 0) {
        return true
    }


    const sitemap = new URL("/sitemap.xml", url).href;
    try {
        const response = await fetch(sitemap, { signal: AbortSignal.timeout(10_000) });
        return response.ok;
    } catch {
        return false;
    }
}




export async function sitemapFreshness(sitemapUrl: string): Promise<SitemapFreshness> {
    try {
        const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10_000) });
        const xml = await response.text();

        const dates = [...xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)]
            .map((match) => new Date(match[1]))
            .filter((date) => !isNaN(date.getTime()));

        if (dates.length === 0) {
            return { mostRecentLastmod: null, daysSinceMostRecent: null };
        }

        const mostRecent = new Date(Math.max(...dates.map((date) => date.getTime())));
        const daysSinceMostRecent = Math.floor((Date.now() - mostRecent.getTime()) / 86_400_000);

        return { mostRecentLastmod: mostRecent.toISOString(), daysSinceMostRecent };
    } catch {
        return { mostRecentLastmod: null, daysSinceMostRecent: null };
    }
}


export function sitemapPresent(url: string, exists: boolean, urlsFromRobots: string[]): Finding {
    return {
        criterionKey: "access.sitemap_present",
        url,
        status: exists ? (urlsFromRobots.length > 0 ? "pass" : "warn") : "fail",
        evidence: { exists, urlsFromRobots },
    };
}

export function sitemapFresh(url: string, exists: boolean, freshness: SitemapFreshness): Finding {
    const criterionKey = "access.sitemap_freshness";

    if (!exists) return skipped(criterionKey, url, "no sitemap");
    if (freshness.daysSinceMostRecent === null) return skipped(criterionKey, url, "no readable lastmod");

    return {
        criterionKey,
        url,
        status: freshness.daysSinceMostRecent > SITEMAP_STALE_DAYS ? "warn" : "pass",
        evidence: { ...freshness },
    };
}
