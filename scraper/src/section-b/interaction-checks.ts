import { parseHTML } from "linkedom";
import type { Finding, InteractionCapture, PageSnapshot, Rulebook } from "../types.ts";
import { percentage, skipped, thresholdsFor } from "../utils.ts";

const PAGINATION_HREF = /[?&]page=\d|\/page\/\d/i;
const PAGINATION_LABEL = /pagin/i;

export function contentBehindInteraction(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
  rulebook: Rulebook,
): Finding {
  const CRITERION = "render.content_behind_interaction";
  const { fail } = thresholdsFor(rulebook, CRITERION);
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
    status: growthPercent > fail ? "fail" : "pass",
    evidence: {
      controlText: loadMore.controlText,
      charsBefore,
      charsAfter,
      growthPercent,
      failPercent: fail,
    },
  };
}

function paginationSignals(renderedHtml: string): string[] {
  const { document } = parseHTML(renderedHtml);
  const signals: string[] = [];

  // rel is a space-separated list: "noopener next" matches, "nextpage" does not.
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

// Growth only fails when no pagination gives the extra content an address.
export function infiniteScroll(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
  rulebook: Rulebook,
): Finding {
  const CRITERION = "render.infinite_scroll";
  const { fail } = thresholdsFor(rulebook, CRITERION);
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

  if (growthPercent <= fail) {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: {
        scrolls: scroll.scrolls,
        charsBefore,
        charsAfter,
        growthPercent,
        failPercent: fail,
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
      failPercent: fail,
      paginationSignals: signals,
    },
  };
}

export function consentWall(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
  rulebook: Rulebook,
): Finding {
  const CRITERION = "render.consent_wall";
  const { fail } = thresholdsFor(rulebook, CRITERION);
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

  // Divide by charsAfter, the whole body, or a heavy banner reads over 100%.
  const gatedPercent = percentage(charsAfter - charsBefore, charsAfter);

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: gatedPercent > fail ? "fail" : "warn",
    evidence: {
      bannerFound: true,
      controlText: consent.controlText,
      charsBefore,
      charsAfter,
      gatedPercent,
      failPercent: fail,
    },
  };
}
