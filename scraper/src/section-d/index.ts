import type { Finding, PageSnapshot, Rulebook } from "../types.ts";
import { structuredDataPresent, structuredDataParses } from "./structured-data.ts";
import { requiredProperties } from "./required-properties.ts";

export function runSectionDAudit(snapshot: PageSnapshot, rulebook: Rulebook): Finding[] {
  return [
    structuredDataPresent(snapshot),
    structuredDataParses(snapshot),
    requiredProperties(snapshot, rulebook),
  ];
}
