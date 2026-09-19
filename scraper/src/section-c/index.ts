import {
  type PageSnapshot,
  type Finding,
  type Rulebook,
} from "../types.ts";

import { extractionRatio } from "./extraction-ratio.ts";
import { linkNavigation } from "./link-navigation.ts";

export function runSectionCAudit(snapshot: PageSnapshot, rulebook: Rulebook): Finding[] {
  return [extractionRatio(snapshot, rulebook), linkNavigation(snapshot, rulebook)];
}
