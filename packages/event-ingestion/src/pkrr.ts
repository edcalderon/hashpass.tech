import { normalizedEventSchema, type EventSource, type NormalizedEvent } from "./schema.js";
import { attribute, elements, firstElement, hasClass, isoDateCandidates, parseHtml, textContent, type HtmlElement } from "./html.js";

export const PKRR_SOURCE: EventSource = {
  sourceId: "pkrr-hash-poker", sourceName: "PKRR / Hash Poker Room", sourceType: "hybrid",
  baseUrl: "https://pkrr.io/c/hash-poker", pollingIntervalMinutes: 60, parserStrategy: "pkrr-next-html", active: true,
};

const slugify = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const classElement = (root: HtmlElement, name: string) => firstElement(root, element => hasClass(element, name));

function localIso(date: string, displayedTime: string): string {
  const clean = displayedTime.toLowerCase().replace(/\s/g, " ");
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
  if (!match) throw new Error(`Invalid PKRR time: ${displayedTime}`);
  let hour = Number(match[1]); const minute = Number(match[2] || 0); const meridiem = match[3]?.replace(/[.\s]/g, "");
  if (meridiem === "pm" && hour < 12) hour += 12; if (meridiem === "am" && hour === 12) hour = 0;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`;
}

export function parsePkrrHtml(html: string, now = new Date()): NormalizedEvent[] {
  const document = parseHtml(html);
  const blocks = elements(document, element => hasClass(element, "wp-day-row"));
  // Next.js RSC includes canonical YYYY-MM-DD keys even though the rendered
  // timeline only displays localized labels such as "14 de agosto".
  const canonicalDates = isoDateCandidates(elements(document, element => element.tagName === "script").map(textContent).join("\n"));
  const createdAt = now.toISOString(); const events: NormalizedEvent[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const date = attribute(block, "data-date") || canonicalDates[blockIndex];
    const cards = elements(block, element => element.tagName === "a" && hasClass(element, "wp-ev"));
    for (const card of cards) {
      if (!date) continue;
      const path = attribute(card, "href") || "";
      const titleElement = classElement(card, "wp-ev-title");
      const title = titleElement ? textContent(titleElement) : "";
      const timeContainer = classElement(card, "wp-ev-time");
      const time = timeContainer ? textContent(firstElement(timeContainer, element => element.tagName === "span") || timeContainer) : "";
      if (!title || !time) continue;
      const externalId = path.split("/").filter(Boolean).pop()!;
      const descriptionElement = classElement(card, "wp-ev-short");
      const description = descriptionElement ? textContent(descriptionElement) : "";
      const venueRow = classElement(card, "row");
      const venueElement = venueRow ? firstElement(venueRow, element => element.tagName === "span") : null;
      const venueName = venueElement ? textContent(venueElement) : "Hash House Club";
      const imageElement = firstElement(card, element => element.tagName === "img");
      const imagePath = imageElement ? attribute(imageElement, "src") || "" : "";
      const startsAt = localIso(date, time);
      events.push(normalizedEventSchema.parse({
        id: `pkrr:${externalId}`, sourceId: PKRR_SOURCE.sourceId, externalId, slug: `hash-poker-${slugify(title)}-${date}`,
        title, description, eventType: /main event/i.test(title) ? "community_tournament" : "poker_room_event",
        startsAt, endsAt: null, timezone: "America/Bogota", venueName, address: "Provenza, El Poblado",
        city: "Medellín", country: "Colombia", coverImage: imagePath ? new URL(imagePath, PKRR_SOURCE.baseUrl).href : null,
        sourceUrl: new URL(path, PKRR_SOURCE.baseUrl).href, organizerName: "Hash Poker Room", organizerLogo: "https://pkrr.io/club-headers/hash-poker-1780960689943.jpg",
        recurrence: { frequency: "weekly", interval: 1, weekdays: [new Date(`${date}T12:00:00Z`).getUTCDay()] },
        status: Date.parse(startsAt) >= now.getTime() ? "upcoming" : "past", tags: ["Weekly Poker Room", "Community Tournament", "Medellín"],
        agenda: [{ id: `${externalId}-arrival`, time, title: "Member arrival and QR check-in", type: "registration" }, { id: `${externalId}-start`, time, title: title, type: "community_event" }],
        speakers: [], sponsors: [], benefits: ["Member smart pass", "Attendance history", "Community networking"], networkingEnabled: true, checkinEnabled: true,
        cta: { label: "Reserve seat", url: new URL(path, PKRR_SOURCE.baseUrl).href }, createdAt, updatedAt: createdAt,
        rawPayload: { path, date, time }, confidence: description && imagePath ? 0.95 : 0.78, needsReview: !(description && imagePath),
      }));
    }
  }
  return events;
}
