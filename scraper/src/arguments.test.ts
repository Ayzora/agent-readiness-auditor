import test from "node:test";
import assert from "node:assert/strict";
import { parseArguments, type Command } from "./arguments.ts";

const cases: { name: string; args: string[]; command: Command }[] = [
  {
    name: "a URL audits that site",
    args: ["https://example.com/"],
    command: { kind: "audit", url: "https://example.com/" },
  },
  {
    name: "pnpm's bare -- separator is ignored",
    args: ["--", "https://example.com/"],
    command: { kind: "audit", url: "https://example.com/" },
  },
  {
    name: "--audit with a positive integer rebuilds that audit, and the id is not read as a URL",
    args: ["--audit", "42"],
    command: { kind: "rebuild", auditId: 42 },
  },
  {
    name: "--audit after the separator still rebuilds",
    args: ["--", "--audit", "42"],
    command: { kind: "rebuild", auditId: 42 },
  },
  {
    name: "nothing at all is a usage error",
    args: [],
    command: { kind: "usage", problem: "no URL" },
  },
  {
    name: "--audit with no id is a usage error",
    args: ["--audit"],
    command: { kind: "usage", problem: "--audit needs an audit id" },
  },
  {
    name: "--audit followed by another flag has no id",
    args: ["--audit", "--"],
    command: { kind: "usage", problem: "--audit needs an audit id" },
  },
  {
    name: "--audit abc is a usage error",
    args: ["--audit", "abc"],
    command: { kind: "usage", problem: "abc is not an audit id" },
  },
  {
    name: "--audit 0 is a usage error",
    args: ["--audit", "0"],
    command: { kind: "usage", problem: "0 is not an audit id" },
  },
  {
    name: "--audit -3 is a usage error",
    args: ["--audit", "-3"],
    command: { kind: "usage", problem: "-3 is not an audit id" },
  },
  {
    name: "--audit 4.5 is a usage error",
    args: ["--audit", "4.5"],
    command: { kind: "usage", problem: "4.5 is not an audit id" },
  },
  {
    name: "--audit together with a URL is a usage error",
    args: ["--audit", "42", "https://example.com/"],
    command: { kind: "usage", problem: "--audit takes no URL" },
  },
  {
    name: "a URL before --audit is a usage error too",
    args: ["https://example.com/", "--audit", "42"],
    command: { kind: "usage", problem: "--audit takes no URL" },
  },
];

for (const { name, args, command } of cases) {
  test(`parseArguments: ${name}`, () => {
    assert.deepEqual(parseArguments(args), command);
  });
}
