import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { join } from "node:path";
import { deduplicateEvents, inspectPublicHtml, nextWeeklyOccurrence, normalizedEventSchema, parseJsonLdEvents, parsePkrrHtml, syncEventSources } from "../src/index.js";

const fixture = (name: string) => readFile(join(import.meta.dirname, "fixtures", name), "utf8");

describe("event ingestion", () => {
  it("normalizes PKRR as a no-speaker community event", async () => {
    const [event] = parsePkrrHtml(await fixture("pkrr.html"), new Date("2026-08-14T00:00:00Z"));
    assert.equal(event.startsAt, "2026-08-18T18:05:00-05:00");
    assert.equal(event.organizerName, "Hash Poker Room"); assert.deepEqual(event.speakers, []);
    assert.equal(event.networkingEnabled, true); assert.equal(event.cta?.label, "Reserve seat");
    assert.doesNotThrow(() => normalizedEventSchema.parse(event));
  });
  it("advances recurrence, rejects invalid dates, and deduplicates", async () => {
    assert.equal(nextWeeklyOccurrence("2026-08-04T23:05:00.000Z", new Date("2026-08-14T00:00:00Z")), "2026-08-18T23:05:00.000Z");
    assert.throws(() => nextWeeklyOccurrence("not-a-date"));
    const [event] = parsePkrrHtml(await fixture("pkrr.html"), new Date("2026-08-14T00:00:00Z"));
    assert.equal(deduplicateEvents([event, { ...event, updatedAt: "2026-08-15T00:00:00.000Z", title: "Changed" }])[0].title, "Changed");
  });
  it("parses generic JSON-LD and detects public source signals", async () => {
    const html = await fixture("generic-jsonld.html");
    assert.equal(parseJsonLdEvents(html, "generic", "https://example.com")[0].title, "Community Night");
    const signals = inspectPublicHtml(`${html}<script>fetch('/api/events')</script>`, "https://example.com/events");
    assert.equal(signals.jsonLd, true); assert.deepEqual(signals.apiCandidates, ["https://example.com/api/events"]);
  });
  it("requires title and a valid date", () => {
    assert.throws(() => normalizedEventSchema.parse({ title: "" }));
    assert.throws(() => normalizedEventSchema.parse({ title: "Event", startsAt: "soon" }));
  });
  it("parses adversarial HTML without regex backtracking or comment leakage", () => {
    const repeated = "<script".repeat(20_000) + "<a href=!".repeat(20_000) + "<div".repeat(20_000);
    const started = Date.now();
    const hostileHtml = `<script type="application/ld+json"><!--not-json--></script>${repeated}`;
    const signals = inspectPublicHtml(hostileHtml, "https://example.com");
    assert.equal(signals.jsonLd, true);
    assert.deepEqual(parseJsonLdEvents(hostileHtml, "generic", "https://example.com"), []);
    assert.ok(Date.now() - started < 2_000);
  });
});

describe("sync failure", () => {
  const files: string[] = [];
  afterEach(async () => { const { rm } = await import("node:fs/promises"); await Promise.all(files.splice(0).map(file => rm(file, { force: true }))); });
  it("retains prior data and exposes degraded health", async () => {
    const outputFile = `/tmp/hashpass-events-${process.pid}.json`; const healthFile = `/tmp/hashpass-health-${process.pid}.json`; files.push(outputFile, healthFile);
    const { writeFile } = await import("node:fs/promises"); await writeFile(outputFile, JSON.stringify({ events: [{ sourceId: "existing" }] }));
    const fetchImpl = async () => { throw new Error("offline"); };
    const result = await syncEventSources({ outputFile, healthFile, fetchImpl: fetchImpl as typeof fetch });
    assert.equal(result.health.status, "degraded"); assert.equal(result.events.length, 1);
  });
  it("does not churn the persisted snapshot when public event content is unchanged", async () => {
    const outputFile = `/tmp/hashpass-events-stable-${process.pid}.json`; const healthFile = `/tmp/hashpass-health-stable-${process.pid}.json`; files.push(outputFile, healthFile);
    const html = await fixture("pkrr.html");
    const fetchImpl = async (input: string | URL | Request) => new Response(String(input).includes("robots.txt") ? "User-agent: *\nAllow: /" : html, { status: 200 });
    await syncEventSources({ outputFile, healthFile, fetchImpl: fetchImpl as typeof fetch, now: new Date("2026-08-14T00:00:00Z") });
    const first = await readFile(outputFile, "utf8");
    await syncEventSources({ outputFile, healthFile, fetchImpl: fetchImpl as typeof fetch, now: new Date("2026-08-14T01:00:00Z") });
    assert.equal(await readFile(outputFile, "utf8"), first);
  });
});
