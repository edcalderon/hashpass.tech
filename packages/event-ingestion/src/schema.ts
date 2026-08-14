import { z } from "zod";

export const sourceTypeSchema = z.enum(["api", "jsonld", "html", "ical", "rss", "manual", "hybrid"]);

export const recurrenceSchema = z.object({
  frequency: z.enum(["weekly", "daily", "monthly"]),
  interval: z.number().int().positive().default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
}).nullable().default(null);

export const normalizedEventSchema = z.object({
  id: z.string().min(1), sourceId: z.string().min(1), externalId: z.string().min(1),
  slug: z.string().min(1), title: z.string().min(1), description: z.string().default(""),
  eventType: z.enum(["conference", "poker_room_event", "community_tournament", "community_event"]),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }).nullable().default(null),
  timezone: z.string().min(1), venueName: z.string().default(""), address: z.string().default(""),
  city: z.string().default(""), country: z.string().default(""), coverImage: z.string().url().nullable().default(null),
  sourceUrl: z.string().url(), organizerName: z.string().min(1), organizerLogo: z.string().url().nullable().default(null),
  recurrence: recurrenceSchema, status: z.enum(["upcoming", "live", "past", "stale", "cancelled"]),
  tags: z.array(z.string()).default([]), agenda: z.array(z.object({ id: z.string(), time: z.string(), title: z.string(), type: z.string() })).default([]),
  speakers: z.array(z.unknown()).default([]), sponsors: z.array(z.unknown()).default([]), benefits: z.array(z.string()).default([]),
  networkingEnabled: z.boolean().default(false), checkinEnabled: z.boolean().default(false),
  cta: z.object({ label: z.string(), url: z.string().url() }).nullable().default(null),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  rawPayload: z.unknown().optional(), confidence: z.number().min(0).max(1), needsReview: z.boolean(),
});

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;

export interface EventSource {
  sourceId: string; sourceName: string; sourceType: SourceType; baseUrl: string;
  pollingIntervalMinutes: number; parserStrategy: string; active: boolean;
}

export interface SourceHealth {
  sourceId: string; status: "healthy" | "degraded" | "failed";
  lastSuccessfulSync: string | null; lastAttempt: string; eventCount: number; error?: string;
}
