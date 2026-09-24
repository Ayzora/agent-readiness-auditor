import { gotScraping } from "got-scraping";
import { readRobots } from "./robots-txt.ts";
import { sitemapLoads } from "./site-sample.ts";
import type { RobotsTxtCapture, SiteFiles, SitemapCapture, SitemapFetch } from "./types.ts";

const FILE_TIMEOUT_MS = 10_000;

// Never throws: a failed fetch leaves its fields null and an `error` set.
export async function captureSiteFiles(url: string): Promise<SiteFiles> {
  const robots = await fetchRobots(url);
  const sitemaps = await fetchSitemaps(url, readRobots(robots).sitemaps);

  return { robots, sitemaps };
}

async function fetchRobots(url: string): Promise<RobotsTxtCapture> {
  const robotsUrl = new URL("/robots.txt", url).href;
  const { statusCode, body, error } = await fetchFile(robotsUrl);
  return { url: robotsUrl, statusCode, body, error };
}

async function fetchSitemaps(url: string, listed: string[]): Promise<SitemapCapture> {
  const source = listed.length > 0 ? "robots.txt" : "default";
  const candidates = listed.length > 0 ? listed : [new URL("/sitemap.xml", url).href];
  const fetches: SitemapFetch[] = [];

  for (const candidate of candidates) {
    const fetch = { url: candidate, ...(await fetchFile(candidate)) };
    fetches.push(fetch);
    if (sitemapLoads(fetch)) break;
  }

  return { source, fetches };
}

async function fetchFile(
  url: string,
): Promise<{ statusCode: number | null; body: string | null; error: string | null }> {
  try {
    const response = await gotScraping({
      url,
      throwHttpErrors: false,
      retry: { limit: 0 },
      timeout: { request: FILE_TIMEOUT_MS },
    });
    return { statusCode: response.statusCode, body: response.body, error: null };
  } catch (error) {
    return { statusCode: null, body: null, error: describe(error) };
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0].trim();
}
