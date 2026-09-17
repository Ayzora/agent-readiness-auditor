import type { Finding, FindingStatus, PageSnapshot, Rulebook } from "../types.ts";
import { skipped, thresholdsFor } from "../utils.ts";
import { parseHTML } from "linkedom";
import { percentage } from "../utils.ts";

const MAX_EXAMPLES = 5;
const MAX_EXAMPLE_CHARS = 120;

export function linkNavigation(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  const CRITERION = "structure.link_navigation";
  const { warn, fail } = thresholdsFor(rulebook, CRITERION);
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (snapshot.rawHtml == null)
    return skip("raw fetch failed", { rawHtml: snapshot.rawHtml, error: snapshot.error });

  const { document } = parseHTML(snapshot.rawHtml);

  const anchors = Array.from(document.querySelectorAll("a"));

  // 1. Followable: <a> with a real URL (real href wins regardless of onclick)
  const followable = anchors.filter((a) => {
    const href = a.getAttribute("href");
    return href && href !== "#" && !href.startsWith("#") && !href.startsWith("javascript:");
  });

  // 2. Unfollowable: <a> with invalid/missing href, non-<a> role="link", or navigating onclicks
  // A Set, because one element can match two rules at once - a
  // <div role="link" onclick="location.href=..."> hits both queries below.
  const unfollowable = [
    ...new Set([
      ...anchors.filter((a) => {
        const href = a.getAttribute("href");
        return href === null || href === "" || href === "#" || href.startsWith("javascript:");
      }),
      ...document.querySelectorAll(':not(a)[role="link"]'),
      ...Array.from(document.querySelectorAll("[onclick]")).filter(
        (el) =>
          el.tagName !== "A" && /location|href|window\.open/.test(el.getAttribute("onclick") ?? ""),
      ),
    ]),
  ];

  const followableLinks = followable.length;
  const unfollowableLinks = unfollowable.length;
  const linkLikeElements = followableLinks + unfollowableLinks;

  const examples = unfollowable.slice(0, MAX_EXAMPLES).map((element) => ({
    tagName: element.tagName,
    html: element.outerHTML.slice(0, MAX_EXAMPLE_CHARS),
  }));

  // null rather than 0: with no link-like elements there is no share to report.
  const unfollowablePercent =
    linkLikeElements === 0 ? null : percentage(unfollowableLinks, linkLikeElements);

  let status: FindingStatus;

  if (followableLinks === 0 || unfollowablePercent === null) {
    status = "fail";
  } else if (unfollowablePercent > fail) {
    status = "fail";
  } else if (unfollowablePercent > warn) {
    status = "warn";
  } else {
    status = "pass";
  }

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status,
    evidence: { followableLinks, unfollowableLinks, unfollowablePercent, examples },
  };
}
