import test from "node:test";
import assert from "node:assert/strict";
import { snapshotFrom } from "./utils.ts";
import { isUnreachable } from "./page-snapshot.ts";
import type { PageSnapshot } from "./types.ts";

const cases: { name: string; snapshot: PageSnapshot; unreachable: boolean }[] = [
  {
    name: "both halves null is unreachable",
    snapshot: snapshotFrom(null, { error: "raw: getaddrinfo ENOTFOUND; rendered: net::ERR_NAME_NOT_RESOLVED" }),
    unreachable: true,
  },
  {
    name: "a 403 body is a response",
    snapshot: snapshotFrom("<html><body>Forbidden</body></html>", { statusCode: 403 }),
    unreachable: false,
  },
  {
    name: "a 500 body is a response",
    snapshot: snapshotFrom("<html><body>Internal Server Error</body></html>", { statusCode: 500 }),
    unreachable: false,
  },
  {
    name: "a rendered half alone is a response",
    snapshot: snapshotFrom(null, { renderedHtml: "<html><body>Hello</body></html>" }),
    unreachable: false,
  },
];

for (const { name, snapshot, unreachable } of cases) {
  test(name, () => {
    assert.equal(isUnreachable(snapshot), unreachable);
  });
}
