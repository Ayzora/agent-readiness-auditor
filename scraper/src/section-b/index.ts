import {
  type PageSnapshot,
  type InteractionCapture,
  type Finding,
  type Soft404Probe,
  type Rulebook,
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
import { soft404 } from "./soft-404.ts";
import {
  consentWall,
  contentBehindInteraction,
  infiniteScroll,
} from "./interaction-checks.ts";

export function runSectionBAudit(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
  soft404Probe: Soft404Probe | null,
  rulebook: Rulebook,
): Finding[] {
  return [
    textCoverage(snapshot, rulebook),
    emptyRenderedPage(snapshot),
    ...redirectFindings(snapshot, rulebook),
    hiddenButPresent(snapshot, interactions, rulebook),
    missingImagesAlt(snapshot, rulebook),
    canvasContent(snapshot, rulebook),
    iframePrimaryContent(snapshot, rulebook),
    contentBehindInteraction(snapshot, interactions, rulebook),
    infiniteScroll(snapshot, interactions, rulebook),
    consentWall(snapshot, interactions, rulebook),
    soft404(snapshot, soft404Probe, rulebook),
  ];
}
