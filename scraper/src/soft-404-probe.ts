import { gotScraping } from "got-scraping";
import { extractText } from "./extract-text.ts";
import { DESKTOP_CHROME_UA } from "./page-snapshot.ts";
import type { Soft404Probe } from "./types.ts";

const PROBE_TIMEOUT_MS = 15_000;

// Site-scope Phase 1: ask the site to show us its error page once, so Section B
// can compare real pages against it rather than grep titles for "not found".
// Sends the same user agent as the raw half of capturePage, so the fingerprint
// and the pages judged against it are the same kind of response.
export async function soft404Probe(siteUrl: string): Promise<Soft404Probe> {
  const slug = `zzz-does-not-exist-${randomSuffix()}`;
  const probeUrl = new URL(`/${slug}`, siteUrl).href;

  try {
    const response = await gotScraping({
      url: probeUrl,
      headers: { "user-agent": DESKTOP_CHROME_UA },
      throwHttpErrors: false,
      retry: { limit: 0 },
      followRedirect: true,
      timeout: { request: PROBE_TIMEOUT_MS },
    });

    return {
      probeUrl,
      statusCode: response.statusCode,
      fingerprint: fingerprintOf(response.body, slug),
      error: null,
    };
  } catch (error) {
    return {
      probeUrl,
      statusCode: null,
      fingerprint: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// The slug is stripped: an error page that echoes the requested path back would
// otherwise carry a token no real page could ever match.
function fingerprintOf(html: string, slug: string): string {
  return extractText(html).replaceAll(slug, " ").replace(/\s+/g, " ").trim();
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
