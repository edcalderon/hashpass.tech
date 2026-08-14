import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { inspectPublicHtml } from "./detector.js";
import { deduplicateEvents } from "./recurrence.js";
import { parsePkrrHtml, PKRR_SOURCE } from "./pkrr.js";
import type { NormalizedEvent, SourceHealth } from "./schema.js";

export interface SyncOptions { outputFile: string; healthFile: string; fetchImpl?: typeof fetch; now?: Date }
interface EventSnapshot { generatedAt: string | null; events: NormalizedEvent[] }
const readPrevious = async (file: string): Promise<EventSnapshot> => {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return { generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : null, events: value.events || [] };
  } catch {
    return { generatedAt: null, events: [] };
  }
};
const eventContent = (event: NormalizedEvent) => {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...content } = event;
  return content;
};

export async function syncEventSources(options: SyncOptions) {
  const fetcher = options.fetchImpl || fetch; const now = options.now || new Date(); const previousSnapshot = await readPrevious(options.outputFile); const previous = previousSnapshot.events;
  const health: SourceHealth = { sourceId: PKRR_SOURCE.sourceId, status: "failed", lastSuccessfulSync: null, lastAttempt: now.toISOString(), eventCount: 0 };
  let events = previous;
  try {
    const [robotsResponse, pageResponse] = await Promise.all([fetcher("https://pkrr.io/robots.txt"), fetcher(PKRR_SOURCE.baseUrl)]);
    if (!pageResponse.ok) throw new Error(`PKRR responded ${pageResponse.status}`);
    const [robots, html] = await Promise.all([robotsResponse.ok ? robotsResponse.text() : "", pageResponse.text()]);
    const signals = inspectPublicHtml(html, PKRR_SOURCE.baseUrl, robots);
    if (!signals.allowedByRobots) throw new Error("PKRR community path is disallowed by robots.txt");
    const incoming = parsePkrrHtml(html, now);
    if (!incoming.length) throw new Error("PKRR parser returned no public events");
    const previousById = new Map(previous.map(event => [event.id, event]));
    const stableIncoming = incoming.map(event => {
      const prior = previousById.get(event.id);
      if (!prior) return event;
      const candidate = { ...event, createdAt: prior.createdAt };
      return JSON.stringify(eventContent(candidate)) === JSON.stringify(eventContent(prior)) ? prior : candidate;
    });
    const incomingIds = new Set(stableIncoming.map(event => event.id));
    const retained = previous.filter(event => !incomingIds.has(event.id)).map(event => event.sourceId === PKRR_SOURCE.sourceId && event.status === "upcoming" ? { ...event, status: "stale" as const, needsReview: true } : event);
    events = deduplicateEvents([...retained, ...stableIncoming]);
    health.status = "healthy"; health.lastSuccessfulSync = now.toISOString(); health.eventCount = incoming.length;
  } catch (error) {
    health.error = error instanceof Error ? error.message : String(error);
    health.status = previous.length ? "degraded" : "failed";
  }
  await mkdir(dirname(options.outputFile), { recursive: true });
  const hasChanges = JSON.stringify(events) !== JSON.stringify(previous);
  const generatedAt = hasChanges || !previousSnapshot.generatedAt ? now.toISOString() : previousSnapshot.generatedAt;
  const temp = `${options.outputFile}.tmp`; await writeFile(temp, `${JSON.stringify({ generatedAt, events }, null, 2)}\n`); await rename(temp, options.outputFile);
  await mkdir(dirname(options.healthFile), { recursive: true }); await writeFile(options.healthFile, `${JSON.stringify({ sources: [health] }, null, 2)}\n`);
  return { events, health };
}
