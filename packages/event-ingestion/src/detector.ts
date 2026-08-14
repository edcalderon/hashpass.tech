import { attribute, elements, parseHtml, quotedPathCandidates, textContent } from "./html.js";

export interface PublicSourceSignals {
  allowedByRobots: boolean; sitemapUrl: string | null; jsonLd: boolean; hydration: "next" | "nuxt" | null;
  rss: string | null; ical: string | null; apiCandidates: string[]; assets: string[];
}

const absolute = (value: string, baseUrl: string) => new URL(value, baseUrl).href;

export function inspectPublicHtml(html: string, baseUrl: string, robots = ""): PublicSourceSignals {
  const path = new URL(baseUrl).pathname || "/";
  const blocked = robots.split(/\r?\n/).some(line => {
    const match = line.match(/^\s*Disallow:\s*(\S+)/i);
    return Boolean(match?.[1] && match[1] !== "/" && path.startsWith(match[1]));
  }) || /^\s*Disallow:\s*\/\s*$/im.test(robots);
  const document = parseHtml(html);
  const linkElements = elements(document, element => element.tagName === "link" || element.tagName === "a");
  const links = linkElements.map(element => attribute(element, "href")).filter((value): value is string => Boolean(value));
  const scriptElements = elements(document, element => element.tagName === "script");
  const scripts = scriptElements.map(element => attribute(element, "src")).filter((value): value is string => Boolean(value));
  const imageValues = elements(document, element => element.tagName === "img" || element.tagName === "meta")
    .map(element => attribute(element, element.tagName === "img" ? "src" : "content"))
    .filter((value): value is string => Boolean(value));
  const documentText = scriptElements.map(textContent).join("\n");
  return {
    allowedByRobots: !blocked,
    sitemapUrl: robots.match(/^\s*Sitemap:\s*(\S+)/im)?.[1] || null,
    jsonLd: scriptElements.some(element => attribute(element, "type")?.toLowerCase() === "application/ld+json"),
    hydration: /__next_f|__NEXT_DATA__/.test(html) ? "next" : /__NUXT__/.test(html) ? "nuxt" : null,
    rss: links.find(x => /(?:rss|\.xml)/i.test(x)) ? absolute(links.find(x => /(?:rss|\.xml)/i.test(x))!, baseUrl) : null,
    ical: links.find(x => /\.ics(?:$|\?)/i.test(x)) ? absolute(links.find(x => /\.ics(?:$|\?)/i.test(x))!, baseUrl) : null,
    apiCandidates: quotedPathCandidates(documentText).map(value => absolute(value, baseUrl)),
    assets: [...new Set(imageValues.filter(x => /\.(?:png|jpe?g|webp|svg)(?:$|\?)/i.test(x)).map(x => absolute(x, baseUrl)).concat(scripts.map(x => absolute(x, baseUrl))))],
  };
}
