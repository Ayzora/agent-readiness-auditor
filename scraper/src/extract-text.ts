import { parseHTML } from "linkedom";

// Elements whose text is markup or machinery rather than page content. <script>
// matters most: SSR hydration payloads such as __NEXT_DATA__ run to tens of
// kilobytes and would inflate the raw side on exactly the JavaScript-heavy
// sites the ratio exists to catch.
const NON_CONTENT_SELECTOR = "script, style, noscript, template, svg";

const COMMENT_NODE = 8;

function removeComments(node: { childNodes: ArrayLike<any> }): void {
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === COMMENT_NODE) {
            child.parentNode?.removeChild(child);
        } else {
            removeComments(child);
        }
    }
}

// linkedom does not do a browser's full tree correction: only input rooted in aaa
// real <html> element gets a usable document.body, and on input with no root
// element at all (a plain-text response body) reading document.body throws. So
// trust body only for a proper document, and otherwise walk what was parsed.
function documentText(document: any): string {
    const root = document.documentElement;

    if (root?.tagName === "HTML") {
        return document.body?.textContent ?? "";
    }

    return Array.from(document.childNodes as ArrayLike<any>)
        .map((node) => node.textContent ?? "")
        .join("");
}

// The one extractor applied to both sides of every comparison — the raw vs
// rendered ratio and Section A's baseline mismatch. Extracting the two sides
// differently would make the ratio partly a measurement of the parser.
//
// textContent-style, never innerText: innerText is CSS-aware and drops hidden
// elements, but raw HTML has no CSS applied, so mixing the two biases the ratio
// downward on any site with collapsed accordions. Hidden-but-present content is
// measured separately, by the interaction probe.
export function extractText(html: string | null | undefined): string {
    if (!html) return "";

    const { document } = parseHTML(html);

    for (const element of document.querySelectorAll(NON_CONTENT_SELECTOR)) {
        element.remove();
    }
    removeComments(document);

    // Collapse whitespace runs to a single space so the count measures text, not
    // formatting. Length is counted in characters, not words: language-agnostic,
    // no tokenizer, no CJK edge case.
    return documentText(document).replace(/\s+/g, " ").trim();
}
