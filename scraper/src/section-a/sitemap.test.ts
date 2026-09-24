import test from "node:test";
import assert from "node:assert/strict";
import { loadRulebook } from "../rulebook.ts";
import { sitemapLoads } from "../site-sample.ts";
import type { FindingStatus, SitemapCapture, SitemapFetch } from "../types.ts";
import { sitemapFresh, sitemapPresent } from "./sitemap.ts";

const rulebook = loadRulebook();

const SITE_ROOT = "https://test.invalid/";

const sitemap = (overrides: Partial<SitemapFetch> = {}): SitemapFetch => ({
  url: "https://test.invalid/sitemap.xml",
  statusCode: 200,
  body: "<urlset><url><loc>https://test.invalid/</loc></url></urlset>",
  error: null,
  ...overrides,
});

const HTML_SHELL = "<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>";

const loadCases: { name: string; fetch: SitemapFetch; loads: boolean }[] = [
  { name: "a 200 with <urlset loads", fetch: sitemap(), loads: true },
  {
    name: "a 200 with <sitemapindex loads",
    fetch: sitemap({ body: "<sitemapindex><sitemap><loc>https://test.invalid/a.xml</loc></sitemap></sitemapindex>" }),
    loads: true,
  },
  { name: "a 200 with an HTML body does not", fetch: sitemap({ body: HTML_SHELL }), loads: false },
  { name: "a 404 does not", fetch: sitemap({ statusCode: 404, body: "Not Found" }), loads: false },
];

for (const { name, fetch, loads } of loadCases) {
  test(`sitemap loads: ${name}`, () => {
    assert.equal(sitemapLoads(fetch), loads);
  });
}

const LISTED_A = "https://test.invalid/sitemap-a.xml";
const LISTED_B = "https://test.invalid/sitemap-b.xml";

const presentCases: {
  name: string;
  sitemaps: SitemapCapture;
  status: FindingStatus;
  evidence: Record<string, unknown>;
}[] = [
  {
    name: "a sitemap listed in robots.txt loads",
    sitemaps: {
      source: "robots.txt",
      fetches: [sitemap({ url: LISTED_A, statusCode: 404, body: "" }), sitemap({ url: LISTED_B })],
    },
    status: "pass",
    evidence: { listedInRobots: true, loaded: LISTED_B },
  },
  {
    name: "none listed, and /sitemap.xml loads",
    sitemaps: { source: "default", fetches: [sitemap()] },
    status: "warn",
    evidence: { listedInRobots: false, loaded: "https://test.invalid/sitemap.xml" },
  },
  {
    name: "sitemaps listed, and none of them loads",
    sitemaps: {
      source: "robots.txt",
      fetches: [
        sitemap({ url: LISTED_A, statusCode: 404, body: "Not Found" }),
        sitemap({ url: LISTED_B, body: HTML_SHELL }),
      ],
    },
    status: "fail",
    evidence: {
      loaded: null,
      notLoaded: [
        { url: LISTED_A, why: "HTTP 404" },
        { url: LISTED_B, why: "not a sitemap" },
      ],
    },
  },
  {
    name: "none listed, and /sitemap.xml does not load",
    sitemaps: {
      source: "default",
      fetches: [sitemap({ statusCode: null, body: null, error: "Timeout awaiting 'request' for 10000ms" })],
    },
    status: "fail",
    evidence: {
      listedInRobots: false,
      notLoaded: [
        { url: "https://test.invalid/sitemap.xml", why: "Timeout awaiting 'request' for 10000ms" },
      ],
    },
  },
];

for (const { name, sitemaps, status, evidence } of presentCases) {
  test(`sitemap_present: ${name} -> ${status}`, () => {
    const finding = sitemapPresent(SITE_ROOT, sitemaps);

    assert.equal(finding.criterionKey, "access.sitemap_present");
    assert.equal(finding.status, status);
    for (const [key, expected] of Object.entries(evidence)) {
      assert.deepEqual(finding.evidence[key], expected, `evidence.${key}`);
    }
  });
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const withLastmod = (...dates: string[]) =>
  `<urlset>${dates.map((date) => `<url><loc>https://test.invalid/</loc><lastmod>${date}</lastmod></url>`).join("")}</urlset>`;

const freshnessCases: {
  name: string;
  sitemaps: SitemapCapture;
  status: FindingStatus;
  evidence: Record<string, unknown>;
}[] = [
  {
    name: "reads the dates of the sitemap that loaded",
    sitemaps: {
      source: "robots.txt",
      fetches: [
        sitemap({ url: LISTED_A, statusCode: 404, body: withLastmod(daysAgo(1)) }),
        sitemap({ url: LISTED_B, body: withLastmod(daysAgo(400), daysAgo(300)) }),
      ],
    },
    status: "warn",
    evidence: { sitemap: LISTED_B, daysSinceMostRecent: 300 },
  },
  {
    name: "a recent lastmod",
    sitemaps: { source: "default", fetches: [sitemap({ body: withLastmod(daysAgo(10)) })] },
    status: "pass",
    evidence: { daysSinceMostRecent: 10 },
  },
  {
    name: "no sitemap loaded",
    sitemaps: { source: "default", fetches: [sitemap({ body: HTML_SHELL })] },
    status: "skip",
    evidence: { reason: "no sitemap" },
  },
  {
    name: "no readable lastmod",
    sitemaps: { source: "default", fetches: [sitemap()] },
    status: "skip",
    evidence: { reason: "no readable lastmod" },
  },
];

for (const { name, sitemaps, status, evidence } of freshnessCases) {
  test(`sitemap_freshness: ${name} -> ${status}`, () => {
    const finding = sitemapFresh(SITE_ROOT, sitemaps, rulebook);

    assert.equal(finding.criterionKey, "access.sitemap_freshness");
    assert.equal(finding.status, status);
    for (const [key, expected] of Object.entries(evidence)) {
      assert.deepEqual(finding.evidence[key], expected, `evidence.${key}`);
    }
  });
}
