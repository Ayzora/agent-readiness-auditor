import type { Finding, JsonLdEntity, PageSnapshot, Rulebook } from "../types.ts";
import { requiredPropertiesFor, skipped } from "../utils.ts";
import { collectJsonLd } from "./json-ld.ts";

interface TypeReport {
  entities: number;
  incomplete: number;
  properties: string[];
}

export function requiredProperties(snapshot: PageSnapshot, rulebook: Rulebook): Finding {
  const CRITERION = "semantics.required_properties";
  const table = requiredPropertiesFor(rulebook, CRITERION);
  const covered = Object.keys(table);
  const skip = (reason: string, evidence?: Record<string, unknown>) =>
    skipped(CRITERION, snapshot.url, reason, evidence);

  if (snapshot.rawHtml == null) return skip("raw fetch failed", { error: snapshot.error });

  const { entities, declaredTypes } = collectJsonLd(snapshot.rawHtml);

  if (entities.length === 0) return skip("no parseable JSON-LD");

  const knownTypes = declaredTypes.filter((type) => covered.includes(type));
  const unknownTypes = declaredTypes.filter((type) => !covered.includes(type));

  // A hole in our table is not the page's fault, so it costs the page nothing.
  if (knownTypes.length === 0) return skip("no known types declared", { unknownTypes });

  const missing: Record<string, TypeReport> = {};
  const complete: string[] = [];

  for (const type of knownTypes) {
    const report = judge(entities, type, table[type]!);
    if (report.incomplete === 0) complete.push(type);
    else missing[type] = report;
  }

  return {
    criterionKey: CRITERION,
    url: snapshot.url,
    status: Object.keys(missing).length === 0 ? "pass" : "fail",
    evidence: { knownTypes, unknownTypes, missing, complete },
  };
}

function judge(entities: JsonLdEntity[], type: string, required: string[]): TypeReport {
  const ofType = entities.filter((entity) => entity.types.includes(type));
  const properties = new Set<string>();
  let incomplete = 0;

  for (const entity of ofType) {
    const absent = required.filter((path) => !hasPath(entity.value, path));
    if (absent.length > 0) incomplete += 1;
    for (const path of absent) properties.add(path);
  }

  return { entities: ofType.length, incomplete, properties: [...properties] };
}

// A dot steps into a nested object; [] fans out over an array, and every member
// must satisfy the rest of the path.
function hasPath(value: unknown, path: string): boolean {
  // schema.org permits an object or an array almost everywhere, and sites emit both.
  if (Array.isArray(value))
    return value.length > 0 && value.every((member) => hasPath(member, path));

  if (!isObject(value)) return false;

  const [head, ...rest] = path.split(".");
  const fanOut = head!.endsWith("[]");
  const next = value[fanOut ? head!.slice(0, -2) : head!];

  if (!fanOut) return rest.length === 0 ? present(next) : hasPath(next, rest.join("."));

  // An FAQPage with no questions is missing its answers, not vacuously complete.
  const members = Array.isArray(next) ? next : next == null ? [] : [next];
  if (members.length === 0) return false;

  return rest.length === 0
    ? members.every(present)
    : members.every((member) => hasPath(member, rest.join(".")));
}

// A declared-but-empty property tells an agent nothing, so "" and [] count as absent.
function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(present);
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
