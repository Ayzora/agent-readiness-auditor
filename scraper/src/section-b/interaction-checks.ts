// Work item 06 — interaction checks: the Section B checks that read what the
// interaction probe found. The clicking already happened in Phase 1, so every
// function here is synchronous and pure over the numbers it was handed.

import { parseHTML } from "linkedom";
import type { Finding, InteractionCapture, PageSnapshot } from "../types.ts";

// Asserted, not derived. They lift into criteria.yaml at build step 2.
const CONTENT_GROWTH_FAIL_PERCENT = 10;
const SCROLL_GROWTH_FAIL_PERCENT = 10;
const CONSENT_GATED_FAIL_PERCENT = 30;

const PAGINATION_HREF = /[?&]page=\d|\/page\/\d/i;
const PAGINATION_LABEL = /pagin/i;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function skipped(
  criterionKey: string,
  url: string,
  reason: string,
  evidence: Record<string, unknown> = {},
): Finding {
  return { criterionKey, url, status: "skip", evidence: { reason, ...evidence } };
}

function percentage(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

// ---------------------------------------------------------------------------
// render.content_behind_interaction — the "Load more" button
// ---------------------------------------------------------------------------

export function contentBehindInteraction(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
): Finding {
  const CRITERION = "render.content_behind_interaction";
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (interactions === null) return skip("interaction capture did not run");

  const { loadMore } = interactions;
  if (loadMore === null) return skip("the probe's budget ran out before the load-more step");
  if (!loadMore.controlFound) return skip("the page has no load-more control");

  // Found but never clicked leaves what sits behind it unknown, not clean.
  if (!loadMore.clicked)
    return skip("the load-more control was found but the click did not go through", {
      controlText: loadMore.controlText,
    });

  const { charsBefore, charsAfter } = loadMore;
  if (charsBefore === null || charsAfter === null)
    return skip("text was not measured on both sides of the click");
  if (charsBefore === 0) return skip("the page had no text before the click", { charsBefore });

  const growthPercent = percentage(charsAfter - charsBefore, charsBefore);

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: growthPercent > CONTENT_GROWTH_FAIL_PERCENT ? "fail" : "pass",
    evidence: {
      controlText: loadMore.controlText,
      charsBefore,
      charsAfter,
      growthPercent,
      failPercent: CONTENT_GROWTH_FAIL_PERCENT,
    },
  };
}

// ---------------------------------------------------------------------------
// render.infinite_scroll — the endless feed
// ---------------------------------------------------------------------------

// Infers, since Phase 1 records three numbers about scrolling and none of them
// is pagination. Same position render.iframe_primary_content is in.
function paginationSignals(renderedHtml: string): string[] {
  const { document } = parseHTML(renderedHtml);
  const signals: string[] = [];

  // rel is a space-separated list, so it is split: "noopener next" matches,
  // "nextpage" does not.
  const relNext = Array.from(document.querySelectorAll("a[rel], link[rel]")).some((element) =>
    (element.getAttribute("rel") ?? "").split(/\s+/).includes("next"),
  );
  if (relNext) signals.push("rel=next");

  const hasPaginationContainer = Array.from(document.querySelectorAll("nav, ul, ol, div")).some(
    (element) =>
      PAGINATION_LABEL.test(
        `${element.id} ${element.getAttribute("class") ?? ""} ${element.getAttribute("aria-label") ?? ""}`,
      ),
  );
  if (hasPaginationContainer) signals.push("pagination container");

  const numberedLinks = Array.from(document.querySelectorAll("a[href]")).filter((anchor) =>
    PAGINATION_HREF.test(anchor.getAttribute("href") ?? ""),
  );
  if (numberedLinks.length > 0) signals.push("numbered page link");

  return signals;
}

// Growth alone is not the verdict: content also reachable at ?page=2 has an
// address an agent can fetch. With no pagination it has none.
export function infiniteScroll(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
): Finding {
  const CRITERION = "render.infinite_scroll";
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (interactions === null) return skip("interaction capture did not run");

  const { scroll } = interactions;
  if (scroll === null) return skip("the probe's budget ran out before the scroll step");
  if (scroll.scrolls === 0) return skip("the page was never scrolled");

  // Without the DOM, warn and fail cannot be told apart.
  if (snapshot.renderedHtml === null)
    return skip("render failed, so pagination could not be checked", { error: snapshot.error });

  const { charsBefore, charsAfter } = scroll;
  if (charsBefore === 0) return skip("the page had no text before scrolling", { charsBefore });

  const growthPercent = percentage(charsAfter - charsBefore, charsBefore);

  if (growthPercent <= SCROLL_GROWTH_FAIL_PERCENT) {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: {
        scrolls: scroll.scrolls,
        charsBefore,
        charsAfter,
        growthPercent,
        failPercent: SCROLL_GROWTH_FAIL_PERCENT,
      },
    };
  }

  const signals = paginationSignals(snapshot.renderedHtml);

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: signals.length > 0 ? "warn" : "fail",
    evidence: {
      scrolls: scroll.scrolls,
      charsBefore,
      charsAfter,
      growthPercent,
      failPercent: SCROLL_GROWTH_FAIL_PERCENT,
      paginationSignals: signals,
    },
  };
}

// ---------------------------------------------------------------------------
// render.consent_wall — the cookie banner
// ---------------------------------------------------------------------------

export function consentWall(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
): Finding {
  const CRITERION = "render.consent_wall";
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (interactions === null) return skip("interaction capture did not run");

  const { consent } = interactions;
  if (consent === null) return skip("the probe's budget ran out before the consent step");

  if (!consent.bannerFound)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: { bannerFound: false },
    };

  if (!consent.accepted)
    return skip("a banner was found but could not be accepted, so what it gates is unknown", {
      bannerFound: true,
      controlText: consent.controlText,
    });

  const { charsBefore, charsAfter } = consent;
  if (charsBefore === null || charsAfter === null)
    return skip("body text was not measured on both sides of accepting");
  if (charsAfter === 0) return skip("the page had no text after accepting", { charsAfter });

  // charsAfter is the whole body, so it is the denominator: dividing by the
  // truncated charsBefore would report a heavy banner as well over 100%.
  const gatedPercent = percentage(charsAfter - charsBefore, charsAfter);

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: gatedPercent > CONSENT_GATED_FAIL_PERCENT ? "fail" : "warn",
    evidence: {
      bannerFound: true,
      controlText: consent.controlText,
      charsBefore,
      charsAfter,
      gatedPercent,
      failPercent: CONSENT_GATED_FAIL_PERCENT,
    },
  };
}
