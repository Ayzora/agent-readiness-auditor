import type { Page } from "playwright";
import { extractText, NON_CONTENT_SELECTOR } from "./extract-text.ts";
import { capturePage } from "./page-snapshot.ts";
import type {
  ConsentCapture,
  HiddenTextCapture,
  InteractionCapture,
  LoadMoreCapture,
  PageSnapshot,
  ScrollCapture,
} from "./types.ts";

// Both budgets stop the probe regardless of state. Agents do not click; the
// clicking here only sizes the gap between what an agent sees and what exists.
const MAX_CLICKS = 3;
const TIME_BUDGET_MS = 10_000;
const MAX_SCROLLS = 3;

// Held back from every action's timeout so a step can still take its
// after-measurement before the hard stop cuts it off.
const MEASURE_RESERVE_MS = 1_000;
// A step is not started with less than this left for its actions.
const MIN_ACTION_MS = 500;
const CLICK_TIMEOUT_MS = 2_000;
// After an action, wait for the DOM to go this long without mutating, up to the cap.
const SETTLE_QUIET_MS = 600;
const SETTLE_MAX_MS = 2_000;

// The allowlist is exhaustive: a control is clicked only if its label matches.
// Under a blocklist an unfamiliar button is clicked by default, and while
// under-counting hidden content is a slightly wrong number, clicking "Add to
// cart" on a stranger's shop is a real incident. Labels are matched after
// lowercasing and turning punctuation into spaces.
const LOAD_MORE_LABEL = /^(load|show|see|view) (more|all)\b|^more (results|items|posts|articles|products|stories)$/;
const ACCEPT_LABEL =
  /^(accept|accept all|accept all cookies|accept cookies|allow all|allow all cookies|allow cookies|agree|i agree|i accept|agree and close|accept and close|got it|ok|okay)$/;
// Longer than this and a "Show more…" match is more likely a container than a control.
const MAX_LABEL_CHARS = 40;
// Marks a consent banner by its id, class or aria-label.
const BANNER_HINT = /cookie|consent|gdpr|onetrust|didomi|osano|\bcmp/i;
// Never clicked, even when the label also matches the allowlist.
const FORBIDDEN_LABEL = /\b(buy|checkout|check out|submit|pay|delete|sign up|signup|add to (cart|bag|basket)|subscribe)\b/;

// Targets are tagged in the page and clicked by this attribute.
const PROBE_ATTRIBUTE = "data-ara-probe";
const BANNER_SELECTOR = `[${PROBE_ATTRIBUTE}="banner"]`;
const ACCEPT_SELECTOR = `[${PROBE_ATTRIBUTE}="accept"]`;
const LOAD_MORE_SELECTOR = `[${PROBE_ATTRIBUTE}="load-more"]`;

interface ProbeState {
  deadline: number;
  clicks: number;
  navigatedAway: boolean;
}

// The page snapshot and its interaction capture from one browser session: the
// probe runs on the capture layer's already-open page after the DOM has been
// captured, so it adds no page load and nothing it clicks can contaminate the
// snapshot. If the probe fails or hangs the snapshot still comes back, with
// interactions null and the reason in snapshot.error.
export async function capturePageWithInteractions(
  url: string,
): Promise<{ snapshot: PageSnapshot; interactions: InteractionCapture | null }> {
  let interactions: InteractionCapture | null = null;
  const snapshot = await capturePage(url, async (page) => {
    interactions = await probeInteractions(page);
  });
  return { snapshot, interactions };
}

// Rejects once the time budget is spent, whatever the page is doing. The deadline
// inside runProbe stops new clicks; this is the backstop for a page that hangs.
async function probeInteractions(page: Page): Promise<InteractionCapture> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hardStop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`exceeded ${TIME_BUDGET_MS}ms budget`)), TIME_BUDGET_MS);
  });

  try {
    return await Promise.race([runProbe(page), hardStop]);
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(page: Page): Promise<InteractionCapture> {
  const startedAt = performance.now();
  const state: ProbeState = { deadline: startedAt + TIME_BUDGET_MS, clicks: 0, navigatedAway: false };
  // Fires only for a new document, not for history.pushState, so a load-more
  // control that updates ?page= is not mistaken for leaving the page.
  const onNewDocument = () => {
    state.navigatedAway = true;
  };
  page.on("domcontentloaded", onNewDocument);

  try {
    // First and with zero clicks, before anything has changed the page.
    const hidden = await page.evaluate(measureHiddenInPage, NON_CONTENT_SELECTOR);
    const consent = canAct(state) ? await probeConsent(page, state) : null;
    const loadMore = canAct(state) ? await probeLoadMore(page, state) : null;
    const scroll = canAct(state) ? await probeScroll(page, state) : null;

    return {
      hidden,
      consent,
      loadMore,
      scroll,
      clicks: state.clicks,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    page.off("domcontentloaded", onNewDocument);
  }
}

// Capture body text, accept the banner, capture again. The difference is the
// content gated behind consent.
async function probeConsent(page: Page, state: ProbeState): Promise<ConsentCapture> {
  const located = await locate(page, "consent");
  if (!located.bannerFound) {
    return { bannerFound: false, accepted: false, controlText: null, charsBefore: null, charsAfter: null };
  }

  const charsBefore = await charsOutsideBanner(page, state);
  const accepted = located.controlText !== null && (await click(page, state, ACCEPT_SELECTOR));
  if (!accepted) {
    return { bannerFound: true, accepted: false, controlText: located.controlText, charsBefore, charsAfter: null };
  }

  await settle(page, state);
  const charsAfter = await charsOutsideBanner(page, state);
  return { bannerFound: true, accepted: true, controlText: located.controlText, charsBefore, charsAfter };
}

async function probeLoadMore(page: Page, state: ProbeState): Promise<LoadMoreCapture> {
  const { controlText } = await locate(page, "load-more");
  if (controlText === null) {
    return { controlFound: false, clicked: false, controlText: null, charsBefore: null, charsAfter: null };
  }

  const charsBefore = await measureChars(page, state);
  const clicked = await click(page, state, LOAD_MORE_SELECTOR);
  if (!clicked) {
    return { controlFound: true, clicked: false, controlText, charsBefore, charsAfter: null };
  }

  await settle(page, state);
  return { controlFound: true, clicked: true, controlText, charsBefore, charsAfter: await measureChars(page, state) };
}

// Scrolling is not a click, but it is still bounded: up to MAX_SCROLLS, stopping
// early once a scroll adds nothing.
async function probeScroll(page: Page, state: ProbeState): Promise<ScrollCapture> {
  const charsBefore = await measureChars(page, state);
  let charsAfter = charsBefore;
  let scrolls = 0;

  while (scrolls < MAX_SCROLLS && canAct(state)) {
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    scrolls += 1;
    await settle(page, state);

    const chars = await measureChars(page, state);
    const grew = chars > charsAfter;
    charsAfter = chars;
    if (!grew) break;
  }

  return { scrolls, charsBefore, charsAfter };
}

// Returns whether the control was clicked. One that never becomes clickable in
// time — covered by an overlay, say — is simply left alone. The attempt counts
// against the budget either way.
async function click(page: Page, state: ProbeState, selector: string): Promise<boolean> {
  if (state.clicks >= MAX_CLICKS || !canAct(state)) return false;
  state.clicks += 1;

  try {
    await page.locator(selector).first().click({ timeout: actionTimeout(state, CLICK_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

async function settle(page: Page, state: ProbeState): Promise<void> {
  const maxMs = actionTimeout(state, SETTLE_MAX_MS);
  if (maxMs <= 0) return;
  await page.evaluate(waitForQuietDom, { quietMs: Math.min(SETTLE_QUIET_MS, maxMs), maxMs });
}

// The same extractor as the snapshot's domText, so the counts compare with it.
async function measureChars(page: Page, state: ProbeState): Promise<number> {
  // A same-page control whose script navigates anyway leaves every later
  // measurement describing a different page; better no capture than a wrong one.
  if (state.navigatedAway) throw new Error(`an interaction navigated away to ${page.url()}`);
  return extractText(await page.content()).length;
}

async function charsOutsideBanner(page: Page, state: ProbeState): Promise<number> {
  const total = await measureChars(page, state);
  const banner = page.locator(BANNER_SELECTOR);
  // Accepting may remove the banner or merely hide it; only text still in the
  // DOM is counted in the total, so only that is subtracted.
  if ((await banner.count()) === 0) return total;

  const bannerHtml = await banner.first().evaluate((element) => element.outerHTML);
  return Math.max(0, total - extractText(bannerHtml).length);
}

function actionTimeout(state: ProbeState, capMs: number): number {
  return Math.min(capMs, state.deadline - MEASURE_RESERVE_MS - performance.now());
}

function canAct(state: ProbeState): boolean {
  return actionTimeout(state, Infinity) >= MIN_ACTION_MS;
}

interface Located {
  bannerFound: boolean;
  controlText: string | null;
}

function locate(page: Page, kind: "consent" | "load-more"): Promise<Located> {
  return page.evaluate(locateInPage, {
    kind,
    attribute: PROBE_ATTRIBUTE,
    loadMoreLabel: LOAD_MORE_LABEL.source,
    acceptLabel: ACCEPT_LABEL.source,
    bannerHint: BANNER_HINT.source,
    forbiddenLabel: FORBIDDEN_LABEL.source,
    maxLabelChars: MAX_LABEL_CHARS,
  });
}

// The functions below run inside the page. Playwright serialises their source,
// so they must be self-contained: nothing from module scope comes with them.

function measureHiddenInPage(nonContentSelector: string): HiddenTextCapture {
  const visibility = new Map<Element, boolean>();
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
  let domText = "";
  let visibleText = "";

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(nonContentSelector)) continue;

    domText += node.textContent;
    let visible = visibility.get(parent);
    if (visible === undefined) {
      visible = parent.checkVisibility({ visibilityProperty: true, opacityProperty: true });
      visibility.set(parent, visible);
    }
    if (visible) visibleText += node.textContent;
  }

  const chars = (text: string) => text.replace(/\s+/g, " ").trim().length;
  return { visibleChars: chars(visibleText), domChars: chars(domText) };
}

function waitForQuietDom({ quietMs, maxMs }: { quietMs: number; maxMs: number }): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    });
    let quiet = setTimeout(finish, quietMs);
    const cap = setTimeout(finish, maxMs);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  });
}

function locateInPage(options: {
  kind: "consent" | "load-more";
  attribute: string;
  loadMoreLabel: string;
  acceptLabel: string;
  bannerHint: string;
  forbiddenLabel: string;
  maxLabelChars: number;
}): Located {
  const loadMoreLabel = new RegExp(options.loadMoreLabel);
  const acceptLabel = new RegExp(options.acceptLabel);
  const bannerHint = new RegExp(options.bannerHint, "i");
  const forbiddenLabel = new RegExp(options.forbiddenLabel);

  const labelOf = (element: Element) =>
    ((element as HTMLElement).innerText || element.getAttribute("aria-label") || element.getAttribute("value") || "")
      .replace(/\s+/g, " ")
      .trim();
  const normalise = (label: string) =>
    label.toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  const isVisible = (element: Element) => {
    const box = element.getBoundingClientRect();
    return (
      box.width > 0 && box.height > 0 && element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    );
  };

  // javascript: and same-document links stay on the page; anything else, or an
  // href that cannot be parsed, is treated as leaving it.
  const leadsElsewhere = (anchor: Element) => {
    const href = anchor.getAttribute("href") ?? "";
    if (/^\s*javascript:/i.test(href)) return false;
    try {
      const target = new URL(href, location.href);
      const here = new URL(location.href);
      target.hash = "";
      here.hash = "";
      return target.href !== here.href;
    } catch {
      return true;
    }
  };

  // Never inside or tied to a <form>, never a link to a different URL, never a
  // transactional label — checked on every label the control carries.
  const isSafe = (element: Element) => {
    if (element.closest("form") || element.hasAttribute("form") || element.querySelector("form")) return false;
    const anchors = [element.closest("a[href]"), ...Array.from(element.querySelectorAll("a[href]"))];
    if (anchors.some((anchor) => anchor !== null && leadsElsewhere(anchor))) return false;
    const labels = [labelOf(element), element.getAttribute("aria-label"), element.getAttribute("title")];
    return !labels.some((label) => label && forbiddenLabel.test(normalise(label)));
  };

  // Banners float over the page: fixed or sticky, or a dialog.
  const floats = (element: Element) => {
    for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
      const { position } = getComputedStyle(node);
      if (position === "fixed" || position === "sticky") return true;
      if (node.matches('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return true;
    }
    return false;
  };

  const controls = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"]'));

  if (options.kind === "consent") {
    // In document order, so the first banner containing a control is the outermost.
    const banners = Array.from(document.querySelectorAll("body *")).filter(
      (element) =>
        bannerHint.test(
          `${element.id} ${element.getAttribute("class") ?? ""} ${element.getAttribute("aria-label") ?? ""}`,
        ) &&
        isVisible(element) &&
        floats(element),
    );
    const accept = controls.find(
      (control) =>
        banners.some((banner) => banner.contains(control)) &&
        isVisible(control) &&
        acceptLabel.test(normalise(labelOf(control))) &&
        isSafe(control),
    );
    const banner = accept ? banners.find((candidate) => candidate.contains(accept)) : banners[0];

    if (banner) banner.setAttribute(options.attribute, "banner");
    if (accept) accept.setAttribute(options.attribute, "accept");
    return { bannerFound: banner !== undefined, controlText: accept ? labelOf(accept) : null };
  }

  const loadMore = controls.find((control) => {
    const label = labelOf(control);
    return (
      label.length <= options.maxLabelChars &&
      loadMoreLabel.test(normalise(label)) &&
      !control.closest(`[${options.attribute}="banner"]`) &&
      isVisible(control) &&
      isSafe(control)
    );
  });

  if (loadMore) loadMore.setAttribute(options.attribute, "load-more");
  return { bannerFound: false, controlText: loadMore ? labelOf(loadMore) : null };
}
