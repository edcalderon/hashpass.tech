import type { NormalizedEvent } from "./schema.js";

export function nextWeeklyOccurrence(startsAt: string, now = new Date()): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid recurrence date: ${startsAt}`);
  while (start.getTime() < now.getTime()) start.setUTCDate(start.getUTCDate() + 7);
  return start.toISOString();
}

export function deduplicateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const byKey = new Map<string, NormalizedEvent>();
  for (const event of events) {
    const key = `${event.sourceId}:${event.externalId}`;
    const current = byKey.get(key);
    if (!current || new Date(event.updatedAt) > new Date(current.updatedAt)) byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
