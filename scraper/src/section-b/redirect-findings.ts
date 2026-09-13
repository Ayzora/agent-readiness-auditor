import type { Finding, PageSnapshot } from "../types.ts";

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

  //const diverged = snapshot.resolvedUrl !== snapshot.browserFinalUrl;
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
  const LONG_CHAIN = 3;

  const redirectChainLength: number = snapshot.redirectChain.length ?? null;

  if (redirectChainLength >= LONG_CHAIN && redirectChainLength !== null)
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

