import { parseHTML } from "linkedom";

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


function documentText(document: any): string {
  const root = document.documentElement;

  if (root?.tagName === "HTML") {
    return document.body?.textContent ?? "";
  }

  return Array.from(document.childNodes as ArrayLike<any>)
    .map((node) => node.textContent ?? "")
    .join("");
}

export function extractText(html: string | null | undefined): string {
  if (!html) return "";

  const { document } = parseHTML(html);

  for (const element of document.querySelectorAll(NON_CONTENT_SELECTOR)) {
    element.remove();
  }
  removeComments(document);

  return documentText(document).replace(/\s+/g, " ").trim();
}
