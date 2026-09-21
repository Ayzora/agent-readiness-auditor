import type { Finding, Rulebook } from "../types.ts";
import { captureLlmsTxt } from "./llms-txt-probe.ts";
import { llmsTxtPresent } from "./llms-txt.ts";

export async function runSectionGAudit(url: string, rulebook: Rulebook): Promise<Finding[]> {
  const capture = await captureLlmsTxt(url);

  return [llmsTxtPresent(url, capture, rulebook)];
}
