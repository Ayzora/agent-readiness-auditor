import { gotScraping } from "got-scraping";
import { extractText } from "./extract-text.ts";
import { DESKTOP_CHROME_UA } from "./page-snapshot.ts";
import type { Soft404Probe } from "./types.ts";

const PROBE_TIMEOUT_MS = 15_000;

// Same user agent as capturePage's raw half, so fingerprint and pages compare like for like.
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

// Strip the slug, which an error page may echo back.
function fingerprintOf(html: string, slug: string): string {
  return extractText(html).replaceAll(slug, " ").replace(/\s+/g, " ").trim();
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
