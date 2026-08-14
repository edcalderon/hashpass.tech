import { getHashPokerEventConfig, isActiveIngestedEvent, resolveNextOccurrence } from "@hashpass/config/ingested-event-config";

describe("Hash Poker landing and host configuration", () => {
  it("feeds the carousel-compatible config with the next weekly occurrence", () => {
    const event = getHashPokerEventConfig(new Date("2026-08-14T00:00:00Z"));
    expect(event).not.toBeNull();
    expect(event?.organizerName).toBe("Hash Poker Room");
    expect(event?.series).toBe("Weekly Poker Room");
    expect(Date.parse(event!.eventStartDate!)).toBeGreaterThan(Date.parse("2026-08-14T00:00:00Z"));
  });

  it("rolls stale source dates forward without adding speaker UI", () => {
    const rolled = resolveNextOccurrence({
      startsAt: "2026-08-04T18:05:00-05:00",
      recurrence: { frequency: "weekly", interval: 1, weekdays: [2] },
    } as any, new Date("2026-08-14T00:00:00Z"));
    expect(rolled).toBe("2026-08-18T23:05:00.000Z");
    expect(getHashPokerEventConfig()?.speakers).toBeUndefined();
  });

  it("never promotes stale events into an active host configuration", () => {
    expect(isActiveIngestedEvent({ sourceId: "pkrr-hash-poker", status: "stale" })).toBe(false);
    expect(isActiveIngestedEvent({ sourceId: "pkrr-hash-poker", status: "cancelled" })).toBe(false);
    expect(isActiveIngestedEvent({ sourceId: "pkrr-hash-poker", status: "upcoming" })).toBe(true);
  });
});
