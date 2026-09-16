import { gotScraping } from "got-scraping";
import { chromium, type Page } from "playwright";
import { extractText } from "./extract-text.ts";
import type { PageSnapshot, RenderSettled } from "./types.ts";

// One UA for both halves, so the ratio measures JavaScript dependence, not UA blocking.
export const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RAW_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 5_000;

// onPageReady runs on the open page after capture, so interactions cannot alter the snapshot.
export async function capturePage(
  url: string,
  onPageReady?: (page: Page) => Promise<void>,
): Promise<PageSnapshot> {
  const snapshot = emptySnapshot(url);
  const errors: string[] = [];

  await captureRaw(url, snapshot, errors);
  // Render the resolved URL so a server redirect cannot split the halves across pages.
  await captureRendered(snapshot.resolvedUrl ?? url, snapshot, errors, onPageReady);

  snapshot.error = errors.length > 0 ? errors.join("; ") : null;
  return snapshot;
}

async function captureRaw(url: string, snapshot: PageSnapshot, errors: string[]): Promise<void> {
  const startedAt = performance.now();

  try {
    const response = await gotScraping({
      url,
      headers: { "user-agent": DESKTOP_CHROME_UA },
      followRedirect: true,
      throwHttpErrors: false,
      retry: { limit: 0 },
      timeout: { request: RAW_TIMEOUT_MS },
    });

    snapshot.rawHtml = response.body;
    snapshot.statusCode = response.statusCode;
    snapshot.headers = response.headers;
    snapshot.resolvedUrl = response.url;
    snapshot.redirectChain = (response.redirectUrls ?? []).map(String);
    snapshot.timing.rawMs = elapsedSince(startedAt);
  } catch (error) {
    errors.push(`raw: ${describe(error)}`);
  }
}

async function captureRendered(
  target: string,
  snapshot: PageSnapshot,
  errors: string[],
  onPageReady?: (page: Page) => Promise<void>,
): Promise<void> {
  const startedAt = performance.now();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: DESKTOP_CHROME_UA });
    const page = await context.newPage();

    await page.goto(target, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });

    // Polling sites never reach networkidle: capture anyway and record it in renderSettled.
    let renderSettled: RenderSettled = "networkidle";
    await page.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => {
      renderSettled = "load-timeout";
    });

    snapshot.renderedHtml = await page.content();
    snapshot.browserFinalUrl = page.url();
    snapshot.renderSettled = renderSettled;
    snapshot.visibleText = await page.evaluate(() => document.body?.innerText ?? "");
    snapshot.domText = extractText(snapshot.renderedHtml);
    snapshot.timing.renderedMs = elapsedSince(startedAt);

    if (onPageReady) {
      try {
        await onPageReady(page);
      } catch (error) {
        errors.push(`interaction: ${describe(error)}`);
      }
    }
  } catch (error) {
    errors.push(`rendered: ${describe(error)}`);
  } finally {
    await browser?.close().catch(() => {});
  }
}

function emptySnapshot(url: string): PageSnapshot {
  return {
    url,
    resolvedUrl: null,
    rawHtml: null,
    renderedHtml: null,
    visibleText: null,
    domText: null,
    statusCode: null,
    headers: null,
    redirectChain: [],
    browserFinalUrl: null,
    renderSettled: null,
    timing: { rawMs: null, renderedMs: null },
    error: null,
  };
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

// Playwright errors carry a multi-line call log; keep the first line.
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0].trim();
}
