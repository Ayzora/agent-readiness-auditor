import type { Finding, FindingStatus, PageSnapshot, Rulebook } from "../types.ts";
import { extractText } from "../extract-text.ts";
import { Clamp, skipped, thresholdsFor } from "../utils.ts";

export function getTextCoverage(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  let status: FindingStatus;
  const CRITERION = "render.text_coverage";
  const { fail, warn } = thresholdsFor(rulebook, CRITERION);

  const rawText = extractText(snapshot.rawHtml);
  const renderedText = extractText(snapshot.renderedHtml);

  const rawChars = rawText.length;
  const renderedChars = renderedText.length;

  if (snapshot.renderedHtml === null || renderedChars === 0) {
    return skipped(
      CRITERION,
      snapshot.url,
      snapshot.renderedHtml === null ? "render failed" : "rendered page has no text",
      { rawChars, renderedChars, ratio: null },
    );
  }

  const unclampedRatio = rawChars / renderedChars;
  const ratio = Clamp(unclampedRatio);

  if (ratio < fail) {
    status = "fail";
  } else if (ratio < warn) {
    status = "warn";
  } else {
    status = "pass";
  }

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: {
      ratio,
      unclampedRatio,
      rawChars,
      renderedChars,
    },
  };
}

export function getEmptyRenderedPage(snapshot: PageSnapshot): Finding {
  const CRITERION = "render.empty_rendered_page";

  const renderedChars = extractText(snapshot.renderedHtml).length;

  if (snapshot.renderedHtml === null)
    return skipped(CRITERION, snapshot.url, "render failed", {
      renderedChars: null,
      error: snapshot.error,
    });
  if (renderedChars === 0)
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "fail",
      evidence: { renderedChars },
    };

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: "pass",
    evidence: { renderedChars },
  };
}

// Redirect checks stay silent unless their shape fires; a plain redirect emits nothing.

// Ignores the trailing slash, query and fragment.
function pathOf(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === "" ? "/" : path;
  } catch {
    return null;
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function sameAddress(a: string, b: string): boolean {
  const pathA = pathOf(a);
  const pathB = pathOf(b);
  return pathA !== null && pathA === pathB && originOf(a) === originOf(b);
}

function javascriptRedirect(snapshot: PageSnapshot): Finding | null {
  const { resolvedUrl, browserFinalUrl } = snapshot;
  if (resolvedUrl === null || browserFinalUrl === null) return null;

  // With a server redirect too, it is halvesDiverged's case.
  if (snapshot.redirectChain.length > 0) return null;
  if (sameAddress(resolvedUrl, browserFinalUrl)) return null;

  return {
    criterionKey: "render.js_redirect",
    url: snapshot.url,
    status: "fail",
    evidence: { resolvedUrl, browserFinalUrl, statusCode: snapshot.statusCode },
  };
}

function halvesDiverged(snapshot: PageSnapshot): Finding | null {
  if (snapshot.resolvedUrl === null || snapshot.browserFinalUrl === null) {
    return null;
  }

  const diverged = !sameAddress(snapshot.resolvedUrl, snapshot.browserFinalUrl);

  if (diverged && snapshot.redirectChain.length > 0) {
    return {
      criterionKey: "render.halves_diverged",
      url: snapshot.url,
      status: "fail",
      evidence: {
        resolvedUrl: snapshot.resolvedUrl,
        browserFinalUrl: snapshot.browserFinalUrl,
        redirectChain: snapshot.redirectChain,
      },
    };
  }
  return null;
}

function homepageRedirect(snapshot: PageSnapshot): Finding | null {
  const finalUrl = snapshot.browserFinalUrl ?? snapshot.resolvedUrl;
  if (!finalUrl) return null;

  const requestedPath = pathOf(snapshot.url);
  const finalPath = pathOf(finalUrl);
  if (requestedPath === null || finalPath === null) return null;

  if (requestedPath === "/" || finalPath !== "/") return null;

  if (originOf(snapshot.url) !== originOf(finalUrl)) return null;

  return {
    criterionKey: "render.homepage_redirect",
    url: snapshot.url,
    status: "fail",
    evidence: {
      requestedPath,
      finalUrl,
      statusCode: snapshot.statusCode,
      redirectChain: snapshot.redirectChain,
    },
  };
}

function longRedirectChain(snapshot: PageSnapshot, rulebook: Rulebook): Finding | null {
  const { warn } = thresholdsFor(rulebook, "render.long_redirect_chain");
  const redirectChainLength = snapshot.redirectChain.length;

  if (redirectChainLength >= warn)
    return {
      criterionKey: "render.long_redirect_chain",
      url: snapshot.url,
      status: "warn",
      evidence: {
        redirectChain: snapshot.redirectChain,
        redirectChainLength,
      },
    };

  return null;
}

export function redirectFindings(snapshot: PageSnapshot, rulebook: Rulebook): Finding[] {
  return [
    javascriptRedirect(snapshot),
    halvesDiverged(snapshot),
    homepageRedirect(snapshot),
    longRedirectChain(snapshot, rulebook),
  ].filter((finding): finding is Finding => finding !== null);
}
