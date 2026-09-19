import { snapshotFrom } from "../utils.ts";
import { linkNavigation } from "./link-navigation.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { loadRulebook } from "../rulebook.ts";
import type { FindingStatus } from "../types.ts";

const rulebook = loadRulebook();

// How each kind of element is classified, independent of any verdict. Inline HTML
// rather than fixtures: the whole point of a case is the one element in it.
const countingCases: {
  name: string;
  html: string;
  followableLinks: number;
  unfollowableLinks: number;
}[] = [
  {
    name: "an <a> with a relative href",
    html: `<a href="/pricing">Pricing</a>`,
    followableLinks: 1,
    unfollowableLinks: 0,
  },
  {
    name: "an <a> with an absolute href",
    html: `<a href="https://example.com/docs">Docs</a>`,
    followableLinks: 1,
    unfollowableLinks: 0,
  },
  {
    name: "an <a> with href=#",
    html: `<a href="#">Menu</a>`,
    followableLinks: 0,
    unfollowableLinks: 1,
  },
  {
    name: "an <a> with a javascript: href",
    html: `<a href="javascript:void(0)">Open</a>`,
    followableLinks: 0,
    unfollowableLinks: 1,
  },
  { name: "an <a> with no href", html: `<a>Orphan</a>`, followableLinks: 0, unfollowableLinks: 1 },
  {
    name: "an <a> with an empty href",
    html: `<a href="">Empty</a>`,
    followableLinks: 0,
    unfollowableLinks: 1,
  },
  {
    name: "a non-<a> with role=link",
    html: `<span role="link">Pricing</span>`,
    followableLinks: 0,
    unfollowableLinks: 1,
  },
  {
    name: "a div with a navigating onclick",
    html: `<div onclick="location.href='/x'">Go</div>`,
    followableLinks: 0,
    unfollowableLinks: 1,
  },
  // Requirement 17: neither followable nor unfollowable, so neither count moves.
  {
    name: "an in-page anchor",
    html: `<a href="#pricing">Pricing</a>`,
    followableLinks: 0,
    unfollowableLinks: 0,
  },
  {
    name: "a plain button",
    html: `<button type="submit">Send</button>`,
    followableLinks: 0,
    unfollowableLinks: 0,
  },
  // Requirement 16: a real href wins, and one element is never counted twice.
  {
    name: "an <a> with both a real href and an onclick",
    html: `<a href="/x" onclick="location.href='/y'">Go</a>`,
    followableLinks: 1,
    unfollowableLinks: 0,
  },
  {
    name: "a div matching both the role and onclick rules",
    html: `<div role="link" onclick="location.href='/x'">Go</div>`,
    followableLinks: 0,
    unfollowableLinks: 1,
  },
];

for (const { name, html, followableLinks, unfollowableLinks } of countingCases) {
  test(`counts ${name}`, () => {
    const finding = linkNavigation(snapshotFrom(html), rulebook);

    assert.equal(finding.evidence.followableLinks, followableLinks);
    assert.equal(finding.evidence.unfollowableLinks, unfollowableLinks);
  });
}

const FOLLOWABLE = `<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>`;
const UNFOLLOWABLE = `<a href="#">X</a>`;

// Shares sit clearly inside their band, so retuning a cutoff does not break these.
const verdictCases: { name: string; html: string; expected: FindingStatus }[] = [
  { name: "every link followable (0%)", html: FOLLOWABLE, expected: "pass" },
  {
    name: "one unfollowable in five (20%)",
    html: `${FOLLOWABLE}<a href="/d">D</a>${UNFOLLOWABLE}`,
    expected: "warn",
  },
  {
    name: "two unfollowable in five (40%)",
    html: `${FOLLOWABLE}${UNFOLLOWABLE}${UNFOLLOWABLE}`,
    expected: "fail",
  },
  { name: "no followable links at all", html: UNFOLLOWABLE, expected: "fail" },
  // Requirement 19: nothing link-like is a fail too, not a vacuous pass.
  {
    name: "no link-like elements at all",
    html: `<p>Just prose, and an <a href="#top">anchor</a>.</p>`,
    expected: "fail",
  },
];

for (const { name, html, expected } of verdictCases) {
  test(`verdict with ${name}`, () => {
    const finding = linkNavigation(snapshotFrom(html), rulebook);

    assert.equal(finding.status, expected);
  });
}

// null rather than 0: with no link-like elements there is no share to report.
test("reports a null share when nothing on the page is link-like", () => {
  const finding = linkNavigation(snapshotFrom(`<p>Just prose.</p>`), rulebook);

  assert.equal(finding.evidence.unfollowablePercent, null);
});

test("caps examples at five however many unfollowable links there are", () => {
  const finding = linkNavigation(snapshotFrom(UNFOLLOWABLE.repeat(7)), rulebook);

  assert.equal(finding.evidence.unfollowableLinks, 7);
  assert.equal((finding.evidence.examples as unknown[]).length, 5);
});

test("returns skip when HTML is null", () => {
  const finding = linkNavigation(snapshotFrom(null), rulebook);

  assert.equal(finding.status, "skip");
  assert.equal(finding.evidence.reason, "raw fetch failed");
});
