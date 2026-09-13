import {
  type PageSnapshot,
  type InteractionCapture,
  type Finding,
} from "../types.ts";
import { redirectFindings } from "./redirect-findings.ts";
import {
  getEmptyRenderedPage as emptyRenderedPage,
  getTextCoverage as textCoverage,
} from "./text-coverage.ts";


export function runSectionBAudit(
  snapshot: PageSnapshot,
  interactions: InteractionCapture | null,
): Finding[] {
  return [
    textCoverage(snapshot),
    emptyRenderedPage(snapshot),
    ...redirectFindings(snapshot)
    
  ];
}
