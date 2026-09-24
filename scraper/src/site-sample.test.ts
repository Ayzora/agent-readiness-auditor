import test from "node:test";
import assert from "node:assert/strict";
import type { SiteSample, SitemapCapture, SitemapSampling } from "./types.ts";
import { sampleSite, templateBreakdown } from "./site-sample.ts";

const SITE = "https://test.invalid";

const urlset = (...locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
    .map((loc) => `<url><loc>${loc.startsWith("http") ? loc : SITE + loc}</loc></url>`)
    .join("")}</urlset>`;

const sitemapOf = (body: string, statusCode = 200): SitemapCapture => ({
  source: "robots.txt",
  fetches: [{ url: `${SITE}/sitemap.xml`, statusCode, body, error: null }],
});

function sampled(typedPath: string, body: string): SiteSample {
  const sampling = sampleSite(SITE + typedPath, sitemapOf(body));
  assert.equal(sampling.kind, "sample", "expected a usable sitemap");
  return (sampling as Extract<SitemapSampling, { kind: "sample" }>).sample;
}

const pathOf = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};

const labelsAndSizes = (sample: SiteSample) =>
  sample.templates.map((template) => [template.label, template.urls.length]);

const sampledPaths = (sample: SiteSample, label: string) =>
  sample.templates.find((template) => template.label === label)!.sampled.map(pathOf);

const numbered = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

// No usable sitemap: the run falls back to the typed URL alone.
const fallbackCases: { name: string; sitemaps: SitemapCapture; reason: string }[] = [
  {
    name: "a sitemap index",
    sitemaps: sitemapOf(
      `<sitemapindex><sitemap><loc>${SITE}/sitemap-1.xml</loc></sitemap></sitemapindex>`,
    ),
    reason: "sitemap index",
  },
  {
    name: "an HTML shell answering 200",
    sitemaps: sitemapOf('<!DOCTYPE html><html><body><div id="root"></div></body></html>'),
    reason: "no sitemap",
  },
  { name: "a 404", sitemaps: sitemapOf("Not Found", 404), reason: "no sitemap" },
  {
    name: "a <urlset> with only ineligible URLs",
    sitemaps: sitemapOf(urlset("https://other.invalid/about", "/files/price-list.pdf", "/sitemap-2.xml")),
    reason: "no eligible URLs",
  },
];

for (const { name, sitemaps, reason } of fallbackCases) {
  test(`sampleSite: ${name} -> fallback (${reason})`, () => {
    assert.deepEqual(sampleSite(`${SITE}/`, sitemaps), { kind: "fallback", reason });
  });
}

test("sampleSite: a <urlset> groups by path shape and samples each template", () => {
  const sample = sampled("/", urlset("/", "/about", "/pricing", "/products/a", "/products/b", "/docs/x/y"));

  assert.equal(sample.sitemapUrl, `${SITE}/sitemap.xml`);
  assert.equal(sample.eligibleCount, 6);
  assert.deepEqual(labelsAndSizes(sample), [
    ["/products/*", 2],
    ["/", 1],
    ["/about", 1],
    ["/pricing", 1],
    ["/docs/*/*", 1],
  ]);
  // Every template's first page before any template is topped up.
  assert.deepEqual(sample.pages.map(pathOf), [
    "/",
    "/products/a",
    "/about",
    "/pricing",
    "/docs/x/y",
    "/products/b",
  ]);
  assert.equal(sample.templatesLeftOut, 0);
});

test("sampleSite: other hosts are dropped, www. and the scheme are ignored", () => {
  const sample = sampled(
    "/",
    urlset(
      "https://www.test.invalid/about",
      "http://test.invalid/pricing",
      "https://other.invalid/team",
      "https://shop.test.invalid/cart",
    ),
  );

  assert.deepEqual(sample.pages, [
    `${SITE}/`,
    "https://www.test.invalid/about",
    "http://test.invalid/pricing",
  ]);
});

test("sampleSite: non-page extensions are not eligible, whatever their case", () => {
  const sample = sampled(
    "/",
    urlset("/files/a.PDF", "/img/b.jpg", "/img/c.webp", "/feed.json", "/notes.txt", "/sitemap-2.xml", "/about"),
  );

  assert.equal(sample.eligibleCount, 2);
  assert.deepEqual(sample.pages.map(pathOf), ["/", "/about"]);
});

test("sampleSite: fragments are removed and the duplicates they leave count once", () => {
  const sample = sampled("/", urlset("/about#team", "/about", "/about#history"));

  assert.equal(sample.eligibleCount, 2);
  assert.deepEqual(sample.pages, [`${SITE}/`, `${SITE}/about`]);
});

test("sampleSite: query strings share a template but are kept for capture", () => {
  const sample = sampled("/", urlset("/search?q=shoes", "/search?q=hats", "/search"));

  assert.deepEqual(labelsAndSizes(sample)[0], ["/search", 3]);
  assert.deepEqual(sampledPaths(sample, "/search"), ["/search?q=shoes", "/search?q=hats", "/search"]);
});

test("sampleSite: with /en/ and /fr/, English is kept and its segment is ignored for grouping", () => {
  const sample = sampled(
    "/",
    urlset("/en/products/red-shoe", "/fr/products/red-shoe", "/en/about", "/products/blue-hat", "/fr/a-propos"),
  );

  assert.deepEqual(labelsAndSizes(sample), [
    ["/products/*", 2],
    ["/about", 1],
    ["/", 1],
  ]);
  assert.ok(!sample.pages.some((url) => url.includes("/fr/")), "no French page sampled");
});

test("sampleSite: an en-xx segment counts as English", () => {
  const sample = sampled("/", urlset("/en-GB/about", "/de/uber-uns"));

  assert.deepEqual(sample.pages.map(pathOf), ["/", "/en-GB/about"]);
});

test("sampleSite: a /de/-only site audited from a /de/ URL keeps German", () => {
  const sample = sampled("/de/", urlset("/de/", "/de/produkte/a", "/de/produkte/b", "/de/uber-uns", "/fr/"));

  assert.deepEqual(labelsAndSizes(sample), [
    ["/", 2],
    ["/produkte/*", 2],
    ["/uber-uns", 1],
  ]);
  assert.deepEqual(sampledPaths(sample, "/"), ["/de/", "/"]);
});

test("sampleSite: a /de/-only site audited from / keeps the most common language", () => {
  const sample = sampled("/", urlset("/fr/", "/de/produkte/a", "/de/uber-uns"));

  assert.deepEqual(sample.pages.map(pathOf), ["/", "/de/produkte/a", "/de/uber-uns"]);
});

test("sampleSite: a tie between languages goes to the one that appears first", () => {
  const sample = sampled("/", urlset("/fr/a-propos", "/de/uber-uns"));

  assert.deepEqual(sample.pages.map(pathOf), ["/", "/fr/a-propos"]);
});

test("sampleSite: the typed URL is sampled when missing from the sitemap and in another language", () => {
  const sample = sampled("/fr/produits/x", urlset("/en/about", "/products/a"));

  assert.equal(sample.pages[0], `${SITE}/fr/produits/x`);
  assert.deepEqual(sampledPaths(sample, "/fr/*/*"), ["/fr/produits/x"]);
});

test("sampleSite: a typed URL on a www. variant takes the sitemap entry's place", () => {
  const sampling = sampleSite("https://www.test.invalid/about#team", sitemapOf(urlset("/", "/about")));
  assert.equal(sampling.kind, "sample");
  const { sample } = sampling as Extract<SitemapSampling, { kind: "sample" }>;

  assert.equal(sample.eligibleCount, 2);
  assert.deepEqual(sample.pages, ["https://www.test.invalid/about", `${SITE}/`]);
});

test("sampleSite: / is sampled when the sitemap does not list it", () => {
  const sample = sampled("/about", urlset("/about", "/pricing"));

  assert.equal(sample.eligibleCount, 3);
  assert.deepEqual(sample.pages.map(pathOf), ["/about", "/", "/pricing"]);
});

test("sampleSite: quotas are 5 for the largest template, 3 above 50 URLs, 1 otherwise", () => {
  const sample = sampled(
    "/",
    urlset(
      ...numbered("/blog/b", 55),
      ...numbered("/products/p", 60),
      ...numbered("/docs/d", 10),
      "/about",
    ),
  );

  assert.deepEqual(
    sample.templates.map((template) => [template.label, template.urls.length, template.sampled.length]),
    [
      ["/products/*", 60, 5],
      ["/blog/*", 55, 3],
      ["/docs/*", 10, 1],
      ["/about", 1, 1],
      ["/", 1, 1],
    ],
  );
  // The first URLs in sitemap order.
  assert.deepEqual(sampledPaths(sample, "/blog/*"), ["/blog/b0", "/blog/b1", "/blog/b2"]);
});

test("sampleSite: a template smaller than its quota is sampled whole", () => {
  const sample = sampled("/", urlset("/products/a", "/products/b", "/products/c", "/about"));

  assert.deepEqual(sampledPaths(sample, "/products/*"), ["/products/a", "/products/b", "/products/c"]);
});

test("sampleSite: over 40 pages, the largest templates win and the rest are counted", () => {
  const sample = sampled(
    "/",
    urlset(...numbered("/single-", 50), ...numbered("/products/p", 60), ...numbered("/blog/b", 55)),
  );

  assert.equal(sample.pages.length, 40);
  assert.equal(sample.templates.length, 53);
  // `/` plus the two large templates plus the first 37 single-page templates.
  assert.equal(sample.templatesLeftOut, 13);
  assert.deepEqual(sampledPaths(sample, "/products/*"), ["/products/p0"]);
  assert.deepEqual(sampledPaths(sample, "/blog/*"), ["/blog/b0"]);
  assert.deepEqual(sampledPaths(sample, "/single-0"), ["/single-0"]);
  assert.deepEqual(sampledPaths(sample, "/single-49"), []);
});

test("sampleSite: two runs on the same sitemap sample the same pages", () => {
  const body = urlset(...numbered("/products/p", 70), ...numbered("/blog/b", 20), "/about", "/fr/x");

  assert.deepEqual(sampled("/about", body), sampled("/about", body));
});

test("sampleSite: <loc> values are read through CDATA and XML entities", () => {
  const body = `<urlset><url><loc><![CDATA[${SITE}/about]]></loc></url><url><loc>${SITE}/search?q=a&amp;page=2</loc></url></urlset>`;

  assert.deepEqual(sampled("/", body).pages.map(pathOf), ["/", "/about", "/search?q=a&page=2"]);
});

test("templateBreakdown: one line per template holding an affected page", () => {
  const sample = sampled(
    "/",
    urlset(...numbered("/products/p", 60), "/about", "/pricing"),
  );
  const audited = sample.pages.filter((url) => url !== `${SITE}/products/p4`);

  const lines = templateBreakdown(
    [`${SITE}/products/p0`, `${SITE}/products/p2`, `${SITE}/pricing`],
    sample,
    audited,
  );

  assert.deepEqual(lines, [
    { label: "/products/*", affected: 2, audited: 4, size: 60 },
    { label: "/pricing", affected: 1, audited: 1, size: 1 },
  ]);
});
