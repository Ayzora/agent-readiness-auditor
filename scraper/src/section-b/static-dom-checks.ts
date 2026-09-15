// Work item 05 — static DOM checks: the Section B checks that are pure over the
// rendered DOM alone. Synchronous by construction — no network, no browser.

import { parseHTML } from "linkedom";
import { extractText } from "../extract-text.ts";
import type { Finding, InteractionCapture, PageSnapshot } from "../types.ts";
import { percentage, skipped } from "./utils.ts";

// Every threshold here is asserted, not derived, and expected to be wrong at
// first. They lift into criteria.yaml at build step 2.

// Percentage of DOM text hidden by CSS at which the page is worth reporting.
const HIDDEN_TEXT_WARN_PERCENT = 10;

// Percentage of images with no alt attribute at all that earns each verdict.
const MISSING_ALT_WARN_PERCENT = 10;
const MISSING_ALT_FAIL_PERCENT = 40;

// Characters of readable text below which a page is chrome — a nav bar and a
// footer — and its real content was drawn as pixels.
const MIN_TEXT_CHARS_BESIDE_CANVAS = 500;

// Declared size at which a canvas is big enough to plausibly hold the content,
// separating an app surface from a 1x1 tracker or a confetti effect.
const SUBSTANTIAL_CANVAS_WIDTH = 400;
const SUBSTANTIAL_CANVAS_HEIGHT = 300;

// A canvas or iframe with no width/height attributes is 300x150 per the HTML
// spec.
const EMBED_DEFAULT_WIDTH = 300;
const EMBED_DEFAULT_HEIGHT = 150;

// Characters of text the parent page must have before a framed page is treated
// as an embed rather than the page's real content.
const MIN_TEXT_CHARS_BESIDE_IFRAME = 500;

// Declared size at which an iframe is big enough to hold a page, separating an
// embedded document from a 1x1 ad pixel or a hidden auth frame.
const SUBSTANTIAL_IFRAME_WIDTH = 400;
const SUBSTANTIAL_IFRAME_HEIGHT = 300;

// A width or height given as a percentage this large is a frame filling its
// container, which parseInt alone would read as a handful of pixels.
const FILLS_CONTAINER_PERCENT = 50;

// Never fails: an agent parsing HTML reads hidden-but-present content fine. It
// turns serious in Phase 2, when a collapsed accordion would block a browsing
// agent — so report it, weight it low, never fail on it.
export function hiddenButPresent(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
): Finding {
  const CRITERION = "render.hidden_but_present";
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);
  const { visibleChars, domChars } = interactions?.hidden ?? {};

  if (visibleChars == null || domChars == null || snapshot.renderedHtml == null)
    return skip(
      snapshot.renderedHtml == null ? "render failed" : "interaction capture did not run",
      { error: snapshot.error },
    );

  if (domChars === 0) return skip("rendered page has no text", { visibleChars, domChars });

  const hiddenPercentage = percentage(domChars - visibleChars, domChars);
  const status = hiddenPercentage < HIDDEN_TEXT_WARN_PERCENT ? "pass" : "warn";

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      visibleChars,
      domChars,
      hiddenPercentage,
      warnPercent: HIDDEN_TEXT_WARN_PERCENT,
    },
  };
}

// alt="" is a decision, not an omission: it removes the image from the
// accessibility tree, which is the correct markup for a decorative one. Only a
// missing alt attribute counts against the page.
export function missingImagesAlt(snapshot: PageSnapshot): Finding {
  const CRITERION = "render.images_missing_alt";
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);
  const { renderedHtml } = snapshot;

  if (renderedHtml == null) return skip("render failed", { error: snapshot.error });

  const { document } = parseHTML(renderedHtml);
  const images = Array.from(document.querySelectorAll("img"));

  if (images.length === 0) return skip("page has no images", { totalImages: 0 });

  const totalImages = images.length;
  const imagesMissingAlt = images.filter((image) => !image.hasAttribute("alt")).length;
  const missingAltPercentage = percentage(imagesMissingAlt, totalImages);

  const status =
    missingAltPercentage < MISSING_ALT_WARN_PERCENT
      ? "pass"
      : missingAltPercentage < MISSING_ALT_FAIL_PERCENT
        ? "warn"
        : "fail";

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      totalImages,
      imagesMissingAlt,
      missingAltPercentage,
      warnPercent: MISSING_ALT_WARN_PERCENT,
      failPercent: MISSING_ALT_FAIL_PERCENT,
    },
  };
}

// Reads a canvas width/height attribute, falling back to the spec default when
// it is absent, zero or unparseable.
function declaredPixels(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// A <canvas> holds no text nodes and has no alt attribute, so whatever is drawn
// on it is invisible to an agent. Presence alone warns; it only fails when a
// canvas big enough to hold the content sits on a page with nothing left to
// read — both conditions, since a thin page alone is text_coverage's finding.
export function canvasContent(snapshot: PageSnapshot): Finding {
  const CRITERION = "render.canvas_content";
  const { renderedHtml } = snapshot;

  if (renderedHtml == null)
    return skipped(CRITERION, snapshot.url, "render failed", { error: snapshot.error });

  const { document } = parseHTML(renderedHtml);
  const canvases = document.querySelectorAll("canvas");
  const textChars = extractText(renderedHtml).length;

  if (canvases.length === 0)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: { canvasCount: 0, textChars },
    };

  const canvasSizes = Array.from(canvases, (canvas) => ({
    width: declaredPixels(canvas.getAttribute("width"), EMBED_DEFAULT_WIDTH),
    height: declaredPixels(canvas.getAttribute("height"), EMBED_DEFAULT_HEIGHT),
  }));

  const substantialCanvases = canvasSizes.filter(
    ({ width, height }) => width >= SUBSTANTIAL_CANVAS_WIDTH && height >= SUBSTANTIAL_CANVAS_HEIGHT,
  );

  const status =
    textChars < MIN_TEXT_CHARS_BESIDE_CANVAS && substantialCanvases.length > 0 ? "fail" : "warn";

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      canvasCount: canvases.length,
      substantialCanvasCount: substantialCanvases.length,
      canvasSizes,
      textChars,
      minTextChars: MIN_TEXT_CHARS_BESIDE_CANVAS,
      substantialCanvas: {
        width: SUBSTANTIAL_CANVAS_WIDTH,
        height: SUBSTANTIAL_CANVAS_HEIGHT,
      },
    },
  };
}

// Declared width/height as either a pixel count or a percentage of the
// container, since a full-bleed iframe is usually width="100%" and parseInt
// alone would read that as 100 pixels.
function declaredSize(
  element: Element,
  attribute: "width" | "height",
  fallback: number,
): { pixels: number; fillsContainer: boolean } {
  const raw = element.getAttribute(attribute)?.trim() ?? "";
  const parsed = Number.parseInt(raw, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  if (raw.endsWith("%"))
    return {
      pixels: fallback,
      fillsContainer: valid && parsed >= FILLS_CONTAINER_PERCENT,
    };

  return { pixels: valid ? parsed : fallback, fillsContainer: false };
}

// Same-origin, cross-origin, or unknown for a frame with no resolvable src —
// srcdoc, about:blank, or a src filled in later by script.
function frameOrigin(
  src: string | null,
  pageUrl: string,
): "same" | "cross" | "unknown" {
  if (src == null || src.trim() === "" || src.startsWith("about:"))
    return "unknown";

  try {
    return new URL(src, pageUrl).origin === new URL(pageUrl).origin
      ? "same"
      : "cross";
  } catch {
    return "unknown";
  }
}

// A framed document is a separate HTTP request to a separate URL: it is absent
// from the parent's HTML, absent from the rendered DOM, and an agent fetching
// the page has no reason to go get it. When the wrapper is a nav bar and a
// footer, the content the agent came for is invisible.
//
// Phase 1 does not capture frame text, so this cannot compare the two the way
// the work item describes. It infers instead: a page with almost no text of its
// own that frames a full-sized document is the shell pattern. Evidence carries
// every frame's origin and size so the inference can be checked.
export function iframePrimaryContent(snapshot: PageSnapshot): Finding {
  const CRITERION = "render.iframe_primary_content";
  const { renderedHtml } = snapshot;

  if (renderedHtml == null)
    return skipped(CRITERION, snapshot.url, "render failed", { error: snapshot.error });

  const { document } = parseHTML(renderedHtml);
  const elements = Array.from(document.querySelectorAll("iframe"));
  const parentTextChars = extractText(renderedHtml).length;

  if (elements.length === 0)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "pass",
      evidence: { iframeCount: 0, parentTextChars },
    };

  const pageUrl = snapshot.browserFinalUrl ?? snapshot.resolvedUrl ?? snapshot.url;

  const iframes = elements.map((element) => {
    const src = element.getAttribute("src");
    const width = declaredSize(element, "width", EMBED_DEFAULT_WIDTH);
    const height = declaredSize(element, "height", EMBED_DEFAULT_HEIGHT);

    return {
      src,
      origin: frameOrigin(src, pageUrl),
      width: width.pixels,
      height: height.pixels,
      // Either dimension filling its container is enough: a full-width frame
      // given a fixed pixel height is the ordinary way to embed a document.
      substantial:
        width.fillsContainer ||
        height.fillsContainer ||
        (width.pixels >= SUBSTANTIAL_IFRAME_WIDTH &&
          height.pixels >= SUBSTANTIAL_IFRAME_HEIGHT),
    };
  });

  const substantial = iframes.filter((iframe) => iframe.substantial);
  const sameOrigin = iframes.filter((iframe) => iframe.origin === "same");
  const thinParent = parentTextChars < MIN_TEXT_CHARS_BESIDE_IFRAME;

  // A thin page wrapped around a full-sized frame is the shell, whatever the
  // frame's origin — hosted help centres and embedded docs are cross-origin.
  // On a page with real text of its own, framing that origin is worth noting
  // and an ordinary third-party embed is not.
  const status =
    thinParent && substantial.length > 0
      ? "fail"
      : sameOrigin.length > 0
        ? "warn"
        : "pass";

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      iframeCount: iframes.length,
      substantialIframeCount: substantial.length,
      sameOriginIframeCount: sameOrigin.length,
      parentTextChars,
      iframes,
      minTextChars: MIN_TEXT_CHARS_BESIDE_IFRAME,
      substantialIframe: {
        width: SUBSTANTIAL_IFRAME_WIDTH,
        height: SUBSTANTIAL_IFRAME_HEIGHT,
      },
    },
  };
}

