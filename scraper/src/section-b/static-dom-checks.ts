import { parseHTML } from "linkedom";
import { extractText } from "../extract-text.ts";
import type { Finding, InteractionCapture, PageSnapshot, Rulebook } from "../types.ts";
import { percentage, skipped, thresholdsFor } from "../utils.ts";

// HTML spec default size for a canvas or iframe with no width/height.
const EMBED_DEFAULT_WIDTH = 300;
const EMBED_DEFAULT_HEIGHT = 150;

// Never fails: text-parsing agents read hidden content fine.
export function hiddenButPresent(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
  rulebook: Rulebook,
): Finding {
  const CRITERION = "render.hidden_but_present";
  const { warn } = thresholdsFor(rulebook, CRITERION);
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
  const status = hiddenPercentage < warn ? "pass" : "warn";

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      visibleChars,
      domChars,
      hiddenPercentage,
      warnPercent: warn,
    },
  };
}

// alt="" marks a decorative image; only a missing alt attribute counts.
export function missingImagesAlt(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  const CRITERION = "render.images_missing_alt";
  const { fail, warn } = thresholdsFor(rulebook, CRITERION);
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
    missingAltPercentage < warn
      ? "pass"
      : missingAltPercentage < fail
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
      warnPercent: warn,
      failPercent: fail,
    },
  };
}

function declaredPixels(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Fails only when a large canvas sits on a page with little other text; otherwise warns.
export function canvasContent(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  const CRITERION = "render.canvas_content";
  const {
    min_text_chars: minTextChars,
    min_width: minWidth,
    min_height: minHeight,
  } = thresholdsFor(rulebook, CRITERION);
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
    ({ width, height }) => width >= minWidth && height >= minHeight,
  );

  const status =
    textChars < minTextChars && substantialCanvases.length > 0 ? "fail" : "warn";

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      canvasCount: canvases.length,
      substantialCanvasCount: substantialCanvases.length,
      canvasSizes,
      textChars,
      minTextChars,
      substantialCanvas: { width: minWidth, height: minHeight },
    },
  };
}

// Handles percentages: parseInt alone would read width="100%" as 100 pixels.
function declaredSize(
  element: Element,
  attribute: "width" | "height",
  fallback: number,
  fillsContainerPercent: number,
): { pixels: number; fillsContainer: boolean } {
  const raw = element.getAttribute(attribute)?.trim() ?? "";
  const parsed = Number.parseInt(raw, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  if (raw.endsWith("%"))
    return {
      pixels: fallback,
      fillsContainer: valid && parsed >= fillsContainerPercent,
    };

  return { pixels: valid ? parsed : fallback, fillsContainer: false };
}

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

// Frame text isn't captured, so this infers: a thin page around a full-size frame is a shell.
export function iframePrimaryContent(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  const CRITERION = "render.iframe_primary_content";
  const {
    min_text_chars: minTextChars,
    min_width: minWidth,
    min_height: minHeight,
    fills_container_percent: fillsContainerPercent,
  } = thresholdsFor(rulebook, CRITERION);
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
    const width = declaredSize(element, "width", EMBED_DEFAULT_WIDTH, fillsContainerPercent);
    const height = declaredSize(element, "height", EMBED_DEFAULT_HEIGHT, fillsContainerPercent);

    return {
      src,
      origin: frameOrigin(src, pageUrl),
      width: width.pixels,
      height: height.pixels,
      substantial:
        width.fillsContainer ||
        height.fillsContainer ||
        (width.pixels >= minWidth && height.pixels >= minHeight),
    };
  });

  const substantial = iframes.filter((iframe) => iframe.substantial);
  const sameOrigin = iframes.filter((iframe) => iframe.origin === "same");
  const thinParent = parentTextChars < minTextChars;

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
      minTextChars,
      substantialIframe: { width: minWidth, height: minHeight },
    },
  };
}

