import {
  type PageSnapshot,
  type InteractionCapture,
  type Finding,
} from "../types.ts";
import {
  getEmptyRenderedPage as emptyRenderedPage,
  getTextCoverage as textCoverage,
  redirectFindings,
} from "./text-coverage-and-redirects.ts";
import {
  canvasContent,
  hiddenButPresent,
  iframePrimaryContent,
  missingImagesAlt,
} from "./static-dom-checks.ts";
import {
  consentWall,
  contentBehindInteraction,
  infiniteScroll,
} from "./interaction-checks.ts";

export function runSectionBAudit(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
): Finding[] {
  return [
    // work item 4
    textCoverage(snapshot),
    emptyRenderedPage(snapshot),
    ...redirectFindings(snapshot),
    // work item 5
    hiddenButPresent(snapshot, interactions),
    missingImagesAlt(snapshot),
    canvasContent(snapshot),
    iframePrimaryContent(snapshot),
    // work item 6
    contentBehindInteraction(snapshot, interactions),
    infiniteScroll(snapshot, interactions),
    consentWall(snapshot, interactions),
  ];
}
