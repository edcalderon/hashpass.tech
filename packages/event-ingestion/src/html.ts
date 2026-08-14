import { parse, type DefaultTreeAdapterMap } from "parse5";

export type HtmlNode = DefaultTreeAdapterMap["node"];
export type HtmlElement = DefaultTreeAdapterMap["element"];

export function parseHtml(html: string): HtmlNode {
  return parse(html);
}

export function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

export function attribute(element: HtmlElement, name: string): string | null {
  return element.attrs.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export function hasClass(element: HtmlElement, name: string): boolean {
  return (attribute(element, "class") || "").split(/\s+/).includes(name);
}

export function elements(root: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement[] {
  const matches: HtmlElement[] = [];
  const visit = (node: HtmlNode) => {
    if (isElement(node) && predicate(node)) matches.push(node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(root);
  return matches;
}

export function firstElement(root: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement | null {
  return elements(root, predicate)[0] || null;
}

export function textContent(root: HtmlNode): string {
  if ("value" in root && typeof root.value === "string") return root.value;
  if (!("childNodes" in root)) return "";
  return root.childNodes.map(textContent).join(" ").replace(/\s+/g, " ").trim();
}

export function quotedPathCandidates(value: string): string[] {
  const results = new Set<string>();
  for (const prefix of ["/api/", "/graphql/"]) {
    let cursor = 0;
    while ((cursor = value.indexOf(prefix, cursor)) !== -1) {
      let end = cursor + prefix.length;
      while (end < value.length && !`"'\`<> \\\n\r\t`.includes(value[end])) end += 1;
      results.add(value.slice(cursor, end));
      cursor = end;
    }
  }
  return [...results];
}

export function isoDateCandidates(value: string): string[] {
  const results = new Set<string>();
  for (let index = 0; index <= value.length - 10; index += 1) {
    const candidate = value.slice(index, index + 10);
    if (candidate[4] !== "-" || candidate[7] !== "-") continue;
    const digits = candidate.slice(0, 4) + candidate.slice(5, 7) + candidate.slice(8, 10);
    if (digits.length === 8 && [...digits].every(character => character >= "0" && character <= "9")) {
      const time = Date.parse(`${candidate}T12:00:00Z`);
      if (!Number.isNaN(time)) results.add(candidate);
    }
  }
  return [...results];
}
