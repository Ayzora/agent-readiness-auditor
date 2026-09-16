import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Rulebook } from "./types.ts";

const RULEBOOK_PATH = new URL("../criteria.yaml", import.meta.url);

export function loadRulebook(): Rulebook {
  return parse(readFileSync(RULEBOOK_PATH, "utf8")) as Rulebook;
}
