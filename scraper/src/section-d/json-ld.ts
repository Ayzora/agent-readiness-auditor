import { parseHTML } from "linkedom";
import type { JsonLdBlockError, JsonLdEntity, PageJsonLd } from "../types.ts";

const BLOCK_TYPE = "application/ld+json";

export function collectJsonLd(rawHtml: string): PageJsonLd {
  const { document } = parseHTML(rawHtml);

  const blocks = Array.from(document.querySelectorAll("script")).filter(
    (script) => (script.getAttribute("type") ?? "").trim().toLowerCase() === BLOCK_TYPE,
  );

  const entities: JsonLdEntity[] = [];
  const errors: JsonLdBlockError[] = [];
  let parsedCount = 0;

  blocks.forEach((block, index) => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(block.textContent ?? "");
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : String(error) });
      return;
    }

    parsedCount += 1;

    const found = entitiesIn(parsed);
    // Valid JSON that declares nothing is as useless to an agent as broken JSON.
    if (found.length === 0) errors.push({ index, message: "no @type found" });

    entities.push(...found);
  });

  return {
    blockCount: blocks.length,
    parsedCount,
    entities,
    declaredTypes: [...new Set(entities.flatMap((entity) => entity.types))],
    errors,
  };
}

// An object nested inside a property is part of its parent, not an entity: counting
// the Offer inside a Product would make one declaration look like two.
function entitiesIn(parsed: unknown): JsonLdEntity[] {
  const candidates = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed["@graph"])
      ? parsed["@graph"]
      : [parsed];

  return candidates.filter(isObject).flatMap((value) => {
    const types = normaliseTypes(value["@type"]);
    return types.length === 0 ? [] : [{ types, value }];
  });
}

// A lowercase "product" is left as written so it does not match the rulebook's
// "Product" — that is a real mistake, not a variation.
function normaliseTypes(declared: unknown): string[] {
  const values = Array.isArray(declared) ? declared : [declared];

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((value) =>
      value.includes("/") ? (value.split("/").filter(Boolean).pop() ?? value) : value,
    );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
