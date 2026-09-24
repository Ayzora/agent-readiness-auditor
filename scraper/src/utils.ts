import {
  AGENTS,
  type AccessCapture,
  type Criterion,
  type DocumentCapture,
  type Finding,
  type Gate,
  type LlmsTxtCapture,
  type PageSnapshot,
  type Rulebook,
} from "./types.ts";

export function skipped(
  criterionKey: string,
  url: string,
  reason: string,
  evidence: Record<string, unknown> = {},
): Finding {
  return { criterionKey, url, status: "skip", evidence: { reason, ...evidence } };
}

export function percentage(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

// Reading a threshold the rulebook doesn't define throws instead of returning undefined.
export function thresholdsFor(rulebook: Rulebook, criterionKey: string): Record<string, number> {
  const thresholds = rulebook.criteria.find(
    (criterion) => criterion.key === criterionKey,
  )?.thresholds;
  if (!thresholds) throw new Error(`criteria.yaml has no thresholds for ${criterionKey}`);

  return new Proxy(thresholds, {
    get(target, name) {
      if (typeof name === "string" && !(name in target))
        throw new Error(`criteria.yaml has no threshold "${name}" for ${criterionKey}`);
      return target[name as string];
    },
  });
}

// The per-type table is the rulebook's, not the check's, for the same reason
// thresholds are. Reading a type the table does not define throws.
export function requiredPropertiesFor(
  rulebook: Rulebook,
  criterionKey: string,
): Record<string, string[]> {
  const table = rulebook.criteria.find(
    (criterion) => criterion.key === criterionKey,
  )?.required_properties;
  if (!table) throw new Error(`criteria.yaml has no required_properties for ${criterionKey}`);

  return new Proxy(table, {
    get(target, name) {
      if (typeof name === "string" && !(name in target))
        throw new Error(`criteria.yaml has no required properties for type "${name}"`);
      return target[name as string];
    },
  });
}

// What counts as a key document is a judgement call, so the table is the
// rulebook's. Reading it from a criterion that does not carry one throws.
export function keyTopicsFor(rulebook: Rulebook, criterionKey: string): string[] {
  const topics = rulebook.criteria.find((criterion) => criterion.key === criterionKey)?.key_topics;
  if (!topics) throw new Error(`criteria.yaml has no key_topics for ${criterionKey}`);

  return topics;
}

export const Clamp = (num: number) => Math.min(Math.max(num, 0), 1);

// .invalid is reserved by RFC 2606, so a snapshot that leaks into fetching code fails fast.
const TEST_URL = "https://test.invalid/page";

export function snapshotFrom(
  rawHtml: string | null,
  overrides: Partial<PageSnapshot> = {},
): PageSnapshot {
  return {
    url: TEST_URL,
    resolvedUrl: null,
    rawHtml,
    renderedHtml: null,
    visibleText: null,
    domText: null,
    statusCode: null,
    headers: null,
    redirectChain: [],
    browserFinalUrl: null,
    renderSettled: null,
    timing: { rawMs: null, renderedMs: null },
    error: null,
    ...overrides,
  };
}

// The DocumentCapture a Section F check reads, so a test needs no network and no PDF.
export function documentFrom(overrides: Partial<DocumentCapture> = {}): DocumentCapture {
  return {
    url: "https://test.invalid/files/document.pdf",
    anchorText: null,
    linkedFrom: [TEST_URL],
    isKeyDocument: false,
    keyTopic: null,
    statusCode: 200,
    finalUrl: "https://test.invalid/files/document.pdf",
    contentType: "application/pdf",
    bytes: 100_000,
    fetched: true,
    isPdf: true,
    text: "",
    pageCount: 1,
    isTagged: true,
    taggedBy: "markInfo",
    error: null,
    ...overrides,
  };
}



const VALID_LLMS_TXT = "# Test Site\n\n> A summary.\n\n## Docs\n- [Quickstart](/quickstart)\n";

export function llmsTxtFrom(overrides: Partial<LlmsTxtCapture> = {}): LlmsTxtCapture {
  return {
    url: "https://test.invalid/llms.txt",
    statusCode: 200,
    contentType: "text/plain; charset=utf-8",
    body: VALID_LLMS_TXT,
    bytes: Buffer.byteLength(VALID_LLMS_TXT),
    error: null,
    ...overrides,
  };
}

const AGENT_BODY = "<html><body><p>Welcome to the test site.</p></body></html>";

// A healthy site: every agent allowed, probed and let through, a completed
// rate-limit ramp, and a robots.txt-listed sitemap that loads with a recent
// lastmod. A Section A test overrides only the part it is about.
export function accessFrom(overrides: Partial<AccessCapture> = {}): AccessCapture {
  const today = new Date().toISOString().slice(0, 10);
  return {
    robots: {
      url: "https://test.invalid/robots.txt",
      statusCode: 200,
      body: "User-agent: *\nAllow: /\n\nSitemap: https://test.invalid/sitemap.xml\n",
      error: null,
    },
    agentProbes: AGENTS.map((agent) => ({
      agent,
      statusCode: 200,
      challenged: false,
      body: AGENT_BODY,
      error: null,
    })),
    rateLimit: { limitFoundAt: null, stoppedBy: null, error: null },
    sitemaps: {
      source: "robots.txt",
      fetches: [
        {
          url: "https://test.invalid/sitemap.xml",
          statusCode: 200,
          body: `<urlset><url><loc>${TEST_URL}</loc><lastmod>${today}</lastmod></url></urlset>`,
          error: null,
        },
      ],
    },
    ...overrides,
  };
}

// The scorer never reads evidence, so a finding needs only its key and status.
export function findingFrom(overrides: Partial<Finding> = {}): Finding {
  return {
    criterionKey: "render.text_coverage",
    url: TEST_URL,
    status: "pass",
    evidence: {},
    ...overrides,
  };
}

// A hand-built rulebook, so a scoring test states its own round weights and
// retuning criteria.yaml never breaks it. The dimension defaults to the key's prefix.
export function rulebookFrom(
  criteria: (Partial<Criterion> & Pick<Criterion, "key">)[],
  overrides: { gates?: Gate[]; warn_credit?: number } = {},
): Rulebook {
  return {
    version: "test",
    defaults: { warn_credit: overrides.warn_credit ?? 0.5 },
    criteria: criteria.map((criterion) => ({
      dimension: criterion.key.split(".")[0]!,
      scope: "page",
      ...(criterion.scored === false ? {} : { weight: 10 }),
      severity: "medium",
      effort: "S",
      title: `Title of ${criterion.key}`,
      why: `Why of ${criterion.key}`,
      fix: `Fix of ${criterion.key}`,
      ...criterion,
    })),
    gates: overrides.gates ?? [],
  };
}
