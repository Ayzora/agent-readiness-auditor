import type { PageSnapshot } from "../types.ts";
import { extractText } from "../extract-text.ts";

// Long enough that common phrasing does not match by accident, short enough to
// survive light re-editing.
const SEQUENCE_WORDS = 8;

// Boilerplate can only be told apart from content across several pages. Below
// this, "appears on every page" would delete the corpus instead of the chrome.
const MIN_PAGES_FOR_BOILERPLATE = 3;

export interface HtmlCorpus {
  sequences: Set<string>;
  // Sequences on every captured page — navigation and footers — excluded from
  // both sides, so shared chrome cannot manufacture a match.
  boilerplate: Set<string>;
  pagesCompared: number;
}

export function sequencesOf(text: string | null | undefined): Set<string> {
  const words = (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const sequences = new Set<string>();
  for (let start = 0; start + SEQUENCE_WORDS <= words.length; start += 1) {
    sequences.add(words.slice(start, start + SEQUENCE_WORDS).join(" "));
  }

  return sequences;
}

// Raw HTML only: the comparison asks what an agent receives, as Sections C and D do.
export function buildCorpus(snapshots: PageSnapshot[]): HtmlCorpus {
  const perPage = snapshots
    .filter((snapshot) => snapshot.rawHtml != null)
    .map((snapshot) => sequencesOf(extractText(snapshot.rawHtml)));

  const sequences = new Set<string>();
  for (const page of perPage) {
    for (const sequence of page) sequences.add(sequence);
  }

  const boilerplate = new Set<string>();
  if (perPage.length >= MIN_PAGES_FOR_BOILERPLATE) {
    for (const sequence of perPage[0]!) {
      if (perPage.every((page) => page.has(sequence))) boilerplate.add(sequence);
    }
  }

  return { sequences, boilerplate, pagesCompared: perPage.length };
}

export interface Coverage {
  ratio: number | null;
  sampled: number;
  matched: number;
}

// One-directional: how much of the document can be found in the HTML, never how
// alike the two are. The texts are wildly different lengths, so a symmetric
// measure would punish a page that genuinely carries the document's facts.
export function coverageOf(documentText: string | null, corpus: HtmlCorpus): Coverage {
  const sampled = [...sequencesOf(documentText)].filter(
    (sequence) => !corpus.boilerplate.has(sequence),
  );

  const matched = sampled.filter((sequence) => corpus.sequences.has(sequence)).length;

  return {
    ratio: sampled.length === 0 ? null : matched / sampled.length,
    sampled: sampled.length,
    matched,
  };
}
