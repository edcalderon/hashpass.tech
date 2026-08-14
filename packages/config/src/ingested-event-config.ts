import type { EventConfig } from "@hashpass/types";
import snapshot from "./generated/ingested-events.json";

type IngestedEvent = (typeof snapshot.events)[number];

export function isActiveIngestedEvent(event: { sourceId: string; status: string }): boolean {
  return event.sourceId === "pkrr-hash-poker" && event.status !== "cancelled" && event.status !== "stale";
}

export function resolveNextOccurrence(event: IngestedEvent, now = new Date()): string {
  const next = new Date(event.startsAt);
  if (Number.isNaN(next.getTime())) throw new Error(`Invalid ingested event date: ${event.startsAt}`);
  if (event.recurrence?.frequency === "weekly") {
    while (next.getTime() < now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  }
  return next.toISOString();
}

export function getHashPokerEventConfig(now = new Date()): EventConfig | null {
  const candidates = snapshot.events
    .filter(isActiveIngestedEvent)
    .map(event => ({ event, next: resolveNextOccurrence(event, now) }))
    .sort((a, b) => Date.parse(a.next) - Date.parse(b.next));
  const selected = candidates[0];
  if (!selected) return null;
  const event = selected.event;
  const formatted = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(selected.next));
  return {
    id: "hash-poker", name: "Hash Poker Room", domain: "hash.poker", website: "https://hash.poker",
    title: event.title, subtitle: `Weekly Poker Room • ${event.venueName}, ${event.city}`,
    image: event.coverImage || event.organizerLogo || "", color: "#8B1538", eventStartDate: selected.next,
    eventDateString: `${formatted} • ${event.address}`, series: "Weekly Poker Room",
    geo: { country: "Colombia", continent: "South America" }, eventType: "whitelabel",
    features: ["agenda", "matchmaking", "wallet", "checkin"],
    branding: { primaryColor: "#8B1538", secondaryColor: "#111111", logo: event.organizerLogo || event.coverImage || "" },
    api: { basePath: "/api/events/hash-poker", endpoints: { agenda: "agenda", status: "status", checkin: "checkin" } },
    routes: { home: "/events/hash-poker/home", speakers: "/events/hash-poker/home", bookings: "/events/hash-poker/my-bookings" },
    agenda: candidates.slice(0, 8).map(({ event: item, next }) => ({ id: item.externalId, time: new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: item.timezone }).format(new Date(next)), title: item.title, description: item.description, type: "registration" })),
    quickAccessItems: [
      { id: "agenda", title: "Weekly Schedule", subtitle: "Upcoming tournaments", icon: "event", color: "#8B1538", route: "/events/hash-poker/agenda" },
      { id: "networking", title: "Community Networking", subtitle: "Meet members", icon: "people-alt", color: "#2563EB", route: "/events/hash-poker/networking" },
      { id: "pass", title: "Member Smart Pass", subtitle: "Identity & QR check-in", icon: "wallet", color: "#059669", route: "/(shared)/dashboard/wallet" },
      { id: "info", title: "Hash Poker Room", subtitle: "Host & house information", icon: "info", color: "#D97706", route: "/events/hash-poker/event-info" },
    ],
    sourceId: event.sourceId, organizerName: event.organizerName,
    communityEventType: event.eventType as EventConfig["communityEventType"],
    recurrenceLabel: "Weekly Poker Room", cta: event.cta || undefined,
    networkingEnabled: event.networkingEnabled, checkinEnabled: event.checkinEnabled,
  };
}
