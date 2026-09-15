import { gotScraping } from "got-scraping";
import { chromium, type Page } from "playwright";
import { extractText } from "./extract-text.ts";
import type { PageSnapshot, RenderSettled } from "./types.ts";

// Both halves send this. The ratio must isolate JavaScript dependence alone:
// varying the user agent as well would conflate "you block this agent" with
// "you require JavaScript", and Section A already measures the former.
export const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RAW_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 5_000;

// Page-scope Phase 1 capture: one raw response and one rendered DOM of the same
// resolved address. Shared input for every page-scope section, which is why it
// lives outside the section folders — Sections C-F need the identical pair, and
// putting it in section-b/ would force them to import from another section.
//
// onPageReady runs on the still-open page after the DOM has been captured, so
// interaction probing shares this one browser session rather than opening a
// second. Nothing it does can contaminate what was already measured.
export async function capturePage(
  url: string,
  onPageReady?: (page: Page) => Promise<void>,
): Promise<PageSnapshot> {
  const snapshot = emptySnapshot(url);
  const errors: string[] = [];

  await captureRaw(url, snapshot, errors);
  // Open the browser at the raw half's resolved URL so a server-side redirect
  // cannot leave the two halves describing different pages. Falling back to the
  // input URL keeps a render possible when the raw half failed outright.
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
    // The facts only. Which redirects are findings is Section B's decision.
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

    // A hard networkidle gate would yield no capture at all on sites with
    // polling widgets or live chat, so the timeout is swallowed and the capture
    // proceeds. renderSettled records which state was actually reached — the
    // first field worth reading when a ratio looks wrong.
    let renderSettled: RenderSettled = "networkidle";
    await page.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => {
      renderSettled = "load-timeout";
    });

    snapshot.renderedHtml = await page.content();
    snapshot.browserFinalUrl = page.url();
    snapshot.renderSettled = renderSettled;
    // What CSS leaves visible, against everything in the DOM. The gap between
    // them is hidden-but-present content, which a text-parsing agent reads fine.
    snapshot.visibleText = await page.evaluate(() => document.body?.innerText ?? "");
    snapshot.domText = extractText(snapshot.renderedHtml);
    snapshot.timing.renderedMs = elapsedSince(startedAt);

    if (onPageReady) {
      // A failing interaction probe must not cost us the capture we already have.
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

// Playwright appends a multi-line, ANSI-coloured call log to its messages. The
// first line carries the actual failure; the rest is debug noise in a field that
// gets stored and reported.
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0].trim();
}
