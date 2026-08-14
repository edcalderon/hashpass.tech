import { normalizedEventSchema, type NormalizedEvent } from "./schema.js";
import { attribute, elements, parseHtml, textContent } from "./html.js";

export function parseJsonLdEvents(html: string, sourceId: string, sourceUrl: string, now = new Date()): NormalizedEvent[] {
  const scripts = elements(parseHtml(html), element => element.tagName === "script" && attribute(element, "type")?.toLowerCase() === "application/ld+json");
  const nodes = scripts.flatMap(script => { try { const value = JSON.parse(textContent(script)); return Array.isArray(value) ? value : value["@graph"] || [value]; } catch { return []; } });
  return nodes.filter(node => node?.["@type"] === "Event").map((node, index) => normalizedEventSchema.parse({
    id: `${sourceId}:${node.identifier || index}`, sourceId, externalId: String(node.identifier || node.url || index),
    slug: String(node.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title: node.name,
    description: node.description || "", eventType: "community_event", startsAt: new Date(node.startDate).toISOString(),
    endsAt: node.endDate ? new Date(node.endDate).toISOString() : null, timezone: node.eventSchedule?.scheduleTimezone || "UTC",
    venueName: node.location?.name || "", address: node.location?.address?.streetAddress || "", city: node.location?.address?.addressLocality || "",
    country: node.location?.address?.addressCountry || "", coverImage: Array.isArray(node.image) ? node.image[0] : node.image || null,
    sourceUrl: node.url || sourceUrl, organizerName: node.organizer?.name || "Unknown organizer", organizerLogo: node.organizer?.logo || null,
    recurrence: null, status: Date.parse(node.startDate) >= now.getTime() ? "upcoming" : "past", tags: [], agenda: [], speakers: [], sponsors: [], benefits: [],
    networkingEnabled: false, checkinEnabled: false, cta: null, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    rawPayload: node, confidence: node.location && node.description ? 0.9 : 0.65, needsReview: !(node.location && node.description),
  }));
}
