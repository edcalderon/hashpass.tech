import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { join } from "node:path";
import { attribute, deduplicateEvents, elements, firstElement, hasClass, inspectPublicHtml, isElement, isoDateCandidates, nextWeeklyOccurrence, normalizedEventSchema, parseHtml, parseJsonLdEvents, parsePkrrHtml, quotedPathCandidates, syncEventSources, textContent } from "../src/index.js";

const fixture = (name: string) => readFile(join(import.meta.dirname, "fixtures", name), "utf8");

describe("event ingestion", () => {
  it("reads public HTML safely through the shared DOM helpers", () => {
    const root = parseHtml('<main><article class="event featured"><a HREF="/rsvp">Join <strong>now</strong></a></article></main>');
    const article = firstElement(root, element => element.tagName === "article");
    assert.ok(article && isElement(article));
    assert.equal(attribute(article, "CLASS"), "event featured");
    assert.equal(hasClass(article, "featured"), true);
    assert.equal(textContent(article), "Join now");
    assert.equal(elements(root, element => element.tagName === "a").length, 1);
    assert.deepEqual(quotedPathCandidates('fetch("/api/events"); query("/graphql/events?event=clf")'), ["/api/events", "/graphql/events?event=clf"]);
    assert.deepEqual(isoDateCandidates("2026-08-14 and 2026-08-14, but not 2026-99-99"), ["2026-08-14"]);
  });

  it("normalizes PKRR as a no-speaker community event", async () => {
    const [event] = parsePkrrHtml(await fixture("pkrr.html"), new Date("2026-08-14T00:00:00Z"));
    assert.equal(event.startsAt, "2026-08-18T18:05:00-05:00");
    assert.equal(event.organizerName, "Hash Poker Room"); assert.deepEqual(event.speakers, []);
    assert.equal(event.networkingEnabled, true); assert.equal(event.cta?.label, "Reserve seat");
    assert.doesNotThrow(() => normalizedEventSchema.parse(event));
  });
  it("parses PKRR card variants and discards incomplete cards", () => {
    const [event] = parsePkrrHtml(`<div class="wp-day-row" data-date="2026-08-20">
      <a class="wp-ev" href="/event/main-event">
        <span class="wp-ev-title">Main Event</span>
        <span class="wp-ev-time"><span>12:30 p.m.</span></span>
        <span class="wp-ev-short">Deep stack tournament</span>
        <div class="row"><span>Hash House Club</span></div>
        <img src="/covers/main.jpg" />
      </a>
      <a class="wp-ev" href="/event/incomplete"><span class="wp-ev-title">No time</span></a>
    </div>`, new Date("2026-08-14T00:00:00Z"));

    assert.equal(event.startsAt, "2026-08-20T12:30:00-05:00");
    assert.equal(event.eventType, "community_tournament");
    assert.equal(event.coverImage, "https://pkrr.io/covers/main.jpg");
    assert.equal(event.confidence, 0.95);
    assert.equal(event.needsReview, false);
    assert.throws(() => parsePkrrHtml('<div class="wp-day-row" data-date="2026-08-20"><a class="wp-ev" href="/event/bad"><span class="wp-ev-title">Bad time</span><span class="wp-ev-time">noonish</span></a></div>'), /Invalid PKRR time/);
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
