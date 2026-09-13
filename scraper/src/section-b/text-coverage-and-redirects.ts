// Work item 04 — text coverage and redirect findings.
//
// Pure checks over a captured PageSnapshot. No network code of any kind
// belongs in this folder: every function here is synchronous by construction.

import type { Finding, FindingStatus, PageSnapshot } from "../types.ts";
import { extractText } from "../extract-text.ts";

// Asserted, not derived — expected to be wrong at first, and ready to lift into
// criteria.yaml at build step 2. The principle underneath: could an agent
// reading only HTML still answer a basic question about this page?
const TEXT_COVERAGE_FAIL_THRESHOLD = 0.3;
const TEXT_COVERAGE_PASS_THRESHOLD = 0.6;
const LONG_CHAIN = 3;

const Clamp = (num: number) => Math.min(Math.max(num, 0), 1);

// ---------------------------------------------------------------------------
// Text coverage
// ---------------------------------------------------------------------------

export function getTextCoverage(snapshot: PageSnapshot): Finding {
  let status: FindingStatus;
  const CRITERION = "render.text_coverage";

  const rawText = extractText(snapshot.rawHtml);
  const renderedText = extractText(snapshot.renderedHtml);

  const rawChars = rawText.length;
  const renderedChars = renderedText.length;

  if (snapshot.renderedHtml === null || renderedChars === 0) {
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "skip",
      evidence: {
        rawChars,
        renderedChars,
        ratio: null,
        reason:
          snapshot.renderedHtml === null
            ? "render failed"
            : "rendered page has no text",
      },
    };
  }

  const unclampedRatio = rawChars / renderedChars;
  const ratio = Clamp(unclampedRatio);

  if (ratio < TEXT_COVERAGE_FAIL_THRESHOLD) {
    status = "fail";
  } else if (ratio < TEXT_COVERAGE_PASS_THRESHOLD) {
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
    return {
      criterionKey: CRITERION,
      url: snapshot.url,
      status: "skip",
      evidence: { renderedChars: null, error: snapshot.error },
    };
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

// ---------------------------------------------------------------------------
// Redirects
//
// Most redirects are healthy and universal — http→https, trailing slashes,
// locale prefixes — so these checks stay silent unless one of four named
// shapes fires. A plain single-hop redirect emits nothing.
// ---------------------------------------------------------------------------

// URL comparison normalises the trailing slash and ignores query and fragment,
// trading a rare false negative for far fewer false positives.
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

  // A server redirect means the divergence is not purely client-side; that case
  // belongs to halvesDiverged.
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

function longRedirectChain(snapshot: PageSnapshot): Finding | null {
  const redirectChainLength = snapshot.redirectChain.length;

  if (redirectChainLength >= LONG_CHAIN)
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

export function redirectFindings(snapshot: PageSnapshot): Finding[] {
  return [
    javascriptRedirect(snapshot),
    halvesDiverged(snapshot),
    homepageRedirect(snapshot),
    longRedirectChain(snapshot),
  ].filter((finding): finding is Finding => finding !== null);
}
