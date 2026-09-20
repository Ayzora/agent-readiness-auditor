import { gotScraping } from "got-scraping";
import { parseHTML } from "linkedom";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { DESKTOP_CHROME_UA } from "./page-snapshot.ts";
import type { DocumentCapture, DocumentProbe, PageSnapshot, Rulebook } from "./types.ts";
import { keyTopicsFor } from "./utils.ts";

const CRITERION = "documents.html_equivalent";

// Facts and politeness limits, not judgement calls, so they stay in code.
const MAX_DOCUMENTS = 10;
const SIZE_CEILING_BYTES = 25 * 1024 * 1024;
const DOCUMENT_TIMEOUT_MS = 15_000;
const TOTAL_BUDGET_MS = 90_000;
const PDF_MAGIC = "%PDF-";
// A pathological page count must not hold the run open; the size check has
// already failed anything this long.
const MAX_PAGES_PARSED = 300;

// Two-label registrable domains, so cdn.example.co.uk is still the site's own.
const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "co.jp",
  "co.nz",
  "co.za",
  "com.au",
  "com.br",
  "com.mx",
]);

interface Candidate {
  url: string;
  anchorText: string | null;
  linkedFrom: string[];
  isKeyDocument: boolean;
  keyTopic: string | null;
}

// Phase 1 entry point. Never throws: every failure lands in a capture's `error`.
export async function captureDocuments(
  snapshots: PageSnapshot[],
  rulebook: Rulebook,
): Promise<DocumentProbe> {
  const { candidates, offDomain } = discoverDocuments(snapshots, rulebook);
  const attempted = candidates.slice(0, MAX_DOCUMENTS);

  const documents: DocumentCapture[] = [];
  const startedAt = performance.now();

  for (const candidate of attempted) {
    const remainingMs = TOTAL_BUDGET_MS - (performance.now() - startedAt);

    if (remainingMs <= 0) {
      documents.push(notFetched(candidate, "run budget spent"));
      continue;
    }

    documents.push(await captureDocument(candidate, remainingMs));
  }

  return { discovered: candidates.length, offDomain, documents };
}

// Pure: the link scan reads captured HTML only, so it is testable without a network.
export function discoverDocuments(
  snapshots: PageSnapshot[],
  rulebook: Rulebook,
): { candidates: Candidate[]; offDomain: number } {
  const topics = keyTopicsFor(rulebook, CRITERION);
  const byUrl = new Map<string, Candidate>();
  const offDomain = new Set<string>();

  for (const snapshot of snapshots) {
    if (snapshot.rawHtml == null) continue;

    const pageUrl = snapshot.resolvedUrl ?? snapshot.url;
    const { document } = parseHTML(snapshot.rawHtml);

    for (const anchor of document.querySelectorAll("a")) {
      const documentUrl = pdfLinkFrom(anchor.getAttribute("href"), pageUrl);
      if (documentUrl === null) continue;

      if (!isSameSite(documentUrl, pageUrl)) {
        offDomain.add(documentUrl);
        continue;
      }

      // Keyed without the query string, so a cache-busting ?v=2 does not cost
      // the site a second fetch of the same file. The first URL seen is the one
      // fetched, because a query can carry something the server needs.
      const key = identityOf(documentUrl);

      const existing = byUrl.get(key);
      if (existing) {
        if (!existing.linkedFrom.includes(pageUrl)) existing.linkedFrom.push(pageUrl);
        continue;
      }

      const anchorText = labelOf(anchor);
      const keyTopic = keyTopicIn(anchorText, documentUrl, topics);

      byUrl.set(key, {
        url: documentUrl,
        anchorText,
        linkedFrom: [pageUrl],
        isKeyDocument: keyTopic !== null,
        keyTopic,
      });
    }
  }

  // Key documents first: they carry the criterion the dimension is built around.
  const candidates = [...byUrl.values()].sort(
    (a, b) => Number(b.isKeyDocument) - Number(a.isKeyDocument),
  );

  return { candidates, offDomain: offDomain.size };
}

function pdfLinkFrom(href: string | null, pageUrl: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;

  let resolved: URL;
  try {
    resolved = new URL(href, pageUrl);
  } catch {
    return null;
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  // The query string is ignored, so /terms.pdf?v=2 is the same document as /terms.pdf.
  if (!resolved.pathname.toLowerCase().endsWith(".pdf")) return null;

  resolved.hash = "";
  return resolved.toString();
}

// An icon link carries no text, so its image's alt text is the label a reader
// was given — and the only thing naming what the document is.
function labelOf(anchor: Element): string | null {
  const candidates = [
    anchor.textContent,
    anchor.querySelector("img")?.getAttribute("alt"),
    anchor.getAttribute("aria-label"),
    anchor.getAttribute("title"),
  ];

  for (const candidate of candidates) {
    const label = (candidate ?? "").replace(/\s+/g, " ").trim();
    if (label) return label;
  }

  return null;
}

function identityOf(documentUrl: string): string {
  const url = new URL(documentUrl);
  return `${url.origin}${url.pathname}`;
}

function keyTopicIn(
  anchorText: string | null,
  documentUrl: string,
  topics: string[],
): string | null {
  const filename = decodeURIComponent(new URL(documentUrl).pathname.split("/").pop() ?? "");
  const haystack = `${anchorText ?? ""} ${filename}`.toLowerCase();

  return topics.find((topic) => haystack.includes(topic.toLowerCase())) ?? null;
}

function isSameSite(documentUrl: string, pageUrl: string): boolean {
  return registrableDomain(documentUrl) === registrableDomain(pageUrl);
}

function registrableDomain(url: string): string {
  const labels = new URL(url).hostname.toLowerCase().split(".");
  if (labels.length <= 2) return labels.join(".");

  const lastTwo = labels.slice(-2).join(".");
  return MULTI_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

async function captureDocument(candidate: Candidate, remainingMs: number): Promise<DocumentCapture> {
  const capture = emptyCapture(candidate);
  const response = await fetchDocument(candidate.url, Math.min(DOCUMENT_TIMEOUT_MS, remainingMs));

  capture.statusCode = response.statusCode;
  capture.finalUrl = response.finalUrl;
  capture.contentType = response.contentType;
  capture.bytes = response.bytes;

  if (response.oversize) {
    capture.error = `over the ${SIZE_CEILING_BYTES} byte ceiling`;
    return capture;
  }

  capture.fetched = true;

  if (response.body === null) {
    capture.error = response.error;
    return capture;
  }

  // The bytes decide, not the extension and not the header.
  capture.isPdf = response.body.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
  if (!capture.isPdf) {
    capture.error = response.error;
    return capture;
  }

  const parsed = await parsePdf(response.body);
  capture.text = parsed.text;
  capture.pageCount = parsed.pageCount;
  capture.isTagged = parsed.isTagged;
  capture.taggedBy = parsed.taggedBy;
  capture.error = parsed.error;

  return capture;
}

interface FetchedDocument {
  statusCode: number | null;
  finalUrl: string | null;
  contentType: string | null;
  bytes: number | null;
  body: Buffer | null;
  oversize: boolean;
  error: string | null;
}

// Streamed rather than fetched whole, so Content-Length can stop an oversized
// download before its body arrives.
function fetchDocument(url: string, timeoutMs: number): Promise<FetchedDocument> {
  return new Promise((resolve) => {
    const result: FetchedDocument = {
      statusCode: null,
      finalUrl: null,
      contentType: null,
      bytes: null,
      body: null,
      oversize: false,
      error: null,
    };

    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let stream;
    try {
      stream = gotScraping.stream({
        url,
        headers: { "user-agent": DESKTOP_CHROME_UA },
        followRedirect: true,
        throwHttpErrors: false,
        retry: { limit: 0 },
        timeout: { request: timeoutMs },
      });
    } catch (error) {
      result.error = describe(error);
      finish();
      return;
    }

    stream.on("response", (response) => {
      result.statusCode = response.statusCode ?? null;
      result.finalUrl = response.url ?? url;
      result.contentType = (response.headers["content-type"] as string | undefined) ?? null;

      const advertised = Number(response.headers["content-length"]);
      if (Number.isFinite(advertised)) result.bytes = advertised;

      if (Number.isFinite(advertised) && advertised > SIZE_CEILING_BYTES) {
        result.oversize = true;
        stream.destroy();
        finish();
      }
    });

    stream.on("data", (chunk: Buffer) => {
      received += chunk.length;

      if (received > SIZE_CEILING_BYTES) {
        result.oversize = true;
        result.bytes = received;
        stream.destroy();
        finish();
        return;
      }

      chunks.push(chunk);
    });

    stream.on("end", () => {
      result.body = Buffer.concat(chunks);
      result.bytes = received;
      if (result.statusCode !== null && result.statusCode >= 400)
        result.error = `HTTP ${result.statusCode}`;
      finish();
    });

    stream.on("error", (error: unknown) => {
      result.error = describe(error);
      finish();
    });
  });
}

interface ParsedPdf {
  text: string | null;
  pageCount: number | null;
  isTagged: boolean | null;
  taggedBy: "markInfo" | "structTree" | null;
  error: string | null;
}

async function parsePdf(body: Buffer): Promise<ParsedPdf> {
  const parsed: ParsedPdf = {
    text: null,
    pageCount: null,
    isTagged: null,
    taggedBy: null,
    error: null,
  };

  // A copy, because pdf.js transfers the buffer it is given.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(body),
    useSystemFonts: false,
  });

  try {
    const pdf = await loadingTask.promise;
    parsed.pageCount = pdf.numPages;

    const markInfo = await pdf.getMarkInfo();
    if (markInfo?.Marked === true) {
      parsed.isTagged = true;
      parsed.taggedBy = "markInfo";
    }

    const pages: string[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES_PARSED); number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();

      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));

      if (parsed.isTagged !== true && (await page.getStructTree()) !== null) {
        parsed.isTagged = true;
        parsed.taggedBy = "structTree";
      }
    }

    parsed.text = pages.join("\n").replace(/\s+/g, " ").trim();
    parsed.isTagged = parsed.isTagged === true;
  } catch (error) {
    parsed.error = `parse: ${describe(error)}`;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  return parsed;
}

function emptyCapture(candidate: Candidate): DocumentCapture {
  return {
    url: candidate.url,
    anchorText: candidate.anchorText,
    linkedFrom: candidate.linkedFrom,
    isKeyDocument: candidate.isKeyDocument,
    keyTopic: candidate.keyTopic,
    statusCode: null,
    finalUrl: null,
    contentType: null,
    bytes: null,
    fetched: false,
    isPdf: false,
    text: null,
    pageCount: null,
    isTagged: null,
    taggedBy: null,
    error: null,
  };
}

function notFetched(candidate: Candidate, reason: string): DocumentCapture {
  return { ...emptyCapture(candidate), error: reason };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
