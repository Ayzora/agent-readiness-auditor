import type {
  SampleCoverage,
  SiteSample,
  SitemapCapture,
  SitemapFetch,
  SitemapSampling,
  Template,
  TemplateBreakdownLine,
} from "./types.ts";

// Politeness constraints, not tuning knobs: they bound the load a run puts on
// someone else's site, so a change to them is a safety-sensitive change.
export const MAX_SAMPLED_PAGES = 40;
const LARGEST_TEMPLATE_QUOTA = 5;
const LARGE_TEMPLATE_QUOTA = 3;
const LARGE_TEMPLATE_MIN_URLS = 51;

const NON_PAGE_EXTENSION = /\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip|xml|json|txt)$/i;
const LANGUAGE_SEGMENT = /^([a-z]{2})(-[a-z]{2})?$/i;

// A 200 is not presence: a single-page app answers /sitemap.xml with its shell.
export function sitemapLoads(fetch: SitemapFetch): boolean {
  return (
    fetch.statusCode === 200 &&
    fetch.body !== null &&
    (fetch.body.includes("<urlset") || fetch.body.includes("<sitemapindex"))
  );
}

export function sampleSite(typedUrl: string, sitemaps: SitemapCapture): SitemapSampling {
  const loaded = sitemaps.fetches.find(sitemapLoads);
  if (!loaded) return { kind: "fallback", reason: "no sitemap" };
  if (!loaded.body!.includes("<urlset")) return { kind: "fallback", reason: "sitemap index" };

  const typed = withoutFragment(new URL(typedUrl));
  const listed = sameSitePages(readLocs(loaded.body!), typed);
  const language = keptLanguage(listed, typed);
  const eligible = listed.filter((url) => {
    const segment = languageOf(url);
    return segment === null || segment === language;
  });
  if (eligible.length === 0) return { kind: "fallback", reason: "no eligible URLs" };

  // A sitemap entry for the typed page gives way to it, so the page is captured
  // as it was asked for.
  const typedAt = eligible.findIndex((url) => samePage(url, typed));
  if (typedAt === -1) eligible.push(typed);
  else eligible[typedAt] = typed;

  const root = new URL("/", typed);
  const home = eligible.find((url) => samePage(url, root)) ?? root;
  if (home === root) eligible.push(root);

  const templates = groupIntoTemplates(eligible, language);
  const pages = choosePages(templates, [typed, home].map((url) => url.href));

  return {
    kind: "sample",
    sample: {
      sitemapUrl: loaded.url,
      eligibleCount: eligible.length,
      templates,
      pages,
      templatesLeftOut: templates.filter((template) => template.sampled.length === 0).length,
    },
  };
}

// An <image:loc> never matches.
function readLocs(body: string): string[] {
  return [...body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/loc>/gs)].map((match) =>
    decodeEntities(match[1]),
  );
}

function decodeEntities(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function sameSitePages(locs: string[], typed: URL): URL[] {
  const pages: URL[] = [];
  for (const loc of locs) {
    let url: URL;
    try {
      url = withoutFragment(new URL(loc));
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (bareHost(url) !== bareHost(typed)) continue;
    if (NON_PAGE_EXTENSION.test(url.pathname)) continue;
    if (pages.some((seen) => samePage(seen, url))) continue;
    pages.push(url);
  }
  return pages;
}

function keptLanguage(urls: URL[], typed: URL): string | null {
  const languages = urls.flatMap((url) => languageOf(url) ?? []);
  if (languages.includes("en")) return "en";

  const typedLanguage = languageOf(typed);
  if (typedLanguage !== null) return typedLanguage;

  const counts = new Map<string, number>();
  for (const language of languages) counts.set(language, (counts.get(language) ?? 0) + 1);
  let mostCommon: string | null = null;
  for (const [language, count] of counts) {
    if (mostCommon === null || count > counts.get(mostCommon)!) mostCommon = language;
  }
  return mostCommon;
}

function languageOf(url: URL): string | null {
  const match = LANGUAGE_SEGMENT.exec(segmentsOf(url)[0] ?? "");
  return match ? match[1].toLowerCase() : null;
}

function segmentsOf(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function templateLabel(url: URL, language: string | null): string {
  const segments = segmentsOf(url);
  if (language !== null && languageOf(url) === language) segments.shift();
  if (segments.length === 0) return "/";
  return `/${segments[0]}${"/*".repeat(segments.length - 1)}`;
}

function groupIntoTemplates(eligible: URL[], language: string | null): Template[] {
  const byLabel = new Map<string, Template>();
  for (const url of eligible) {
    const label = templateLabel(url, language);
    const template = byLabel.get(label) ?? { label, urls: [], sampled: [] };
    template.urls.push(url.href);
    byLabel.set(label, template);
  }
  // Insertion order plus a stable sort leaves ties in sitemap order.
  return [...byLabel.values()].sort((a, b) => b.urls.length - a.urls.length);
}

// In capture order, so a time limit cuts the least representative pages first.
function choosePages(templates: Template[], forced: string[]): string[] {
  const pages: string[] = [];
  const add = (template: Template, url: string) => {
    if (pages.includes(url)) return;
    template.sampled.push(url);
    pages.push(url);
  };
  const templateOf = (url: string) => templates.find((template) => template.urls.includes(url))!;

  for (const url of forced) add(templateOf(url), url);

  for (const template of templates) {
    if (pages.length >= MAX_SAMPLED_PAGES) break;
    if (template.sampled.length === 0) add(template, template.urls[0]);
  }

  templates.forEach((template, index) => {
    const quota = Math.min(template.urls.length, quotaFor(template, index));
    for (const url of template.urls) {
      if (template.sampled.length >= quota || pages.length >= MAX_SAMPLED_PAGES) break;
      add(template, url);
    }
  });

  return pages;
}

function quotaFor(template: Template, rank: number): number {
  if (rank === 0) return LARGEST_TEMPLATE_QUOTA;
  return template.urls.length >= LARGE_TEMPLATE_MIN_URLS ? LARGE_TEMPLATE_QUOTA : 1;
}

// After sampling, a template's URL list is only ever counted, so the stored
// shape keeps the count and every printer reads it from there.
export function sampleCoverage(
  sample: SiteSample,
  run: { audited: string[]; unreachable: string[]; notCaptured: string[] },
): SampleCoverage {
  return {
    kind: "sample",
    sitemapUrl: sample.sitemapUrl,
    eligibleCount: sample.eligibleCount,
    templates: sample.templates.map(({ label, urls, sampled }) => ({ label, size: urls.length, sampled })),
    templatesLeftOut: sample.templatesLeftOut,
    pages: sample.pages,
    ...run,
  };
}

// Printed only: template size never enters a score.
export function templateBreakdown(subjects: string[], coverage: SampleCoverage): TemplateBreakdownLine[] {
  return coverage.templates.flatMap((template) => {
    const auditedHere = template.sampled.filter((url) => coverage.audited.includes(url));
    const affected = auditedHere.filter((url) => subjects.includes(url)).length;
    return affected === 0
      ? []
      : [{ label: template.label, affected, audited: auditedHere.length, size: template.size }];
  });
}

function withoutFragment(url: URL): URL {
  url.hash = "";
  return url;
}

function bareHost(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

function samePage(a: URL, b: URL): boolean {
  return bareHost(a) === bareHost(b) && a.pathname === b.pathname && a.search === b.search;
}
