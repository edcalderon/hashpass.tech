/// <reference types="jest" />

import {
  buildWalletPasses,
  countWalletPasses,
  filterWalletPasses,
  filterWalletPassesForExplorer,
  getPassTypeAccent,
  sortWalletPasses,
  type WalletPass,
} from "../../lib/pass-wallet";
import type { PassInfo } from "../../lib/pass-system";

// Backend event-catalog values exercise the date-derived timeline and branded
// pass treatment without relying on a frontend event catalog.
const AUGUST_1_2026 = Date.parse("2026-08-01T12:00:00Z");
const AUGUST_6_2026 = Date.parse("2026-08-06T12:00:00Z");

const eventMetadata: Record<string, Partial<PassInfo>> = {
  bsl: {
    event_name: "BSL On Tour",
    wallet_pass_style: "event",
    wallet_pass_color: "#00A9E0",
  },
  peru2026: {
    event_name: "Blockchain Summit Latam Perú 2026",
    event_location: "Lima, Perú",
    event_starts_at: "2026-05-13T09:00:00-05:00",
    event_ends_at: "2026-05-15T23:59:59-05:00",
    wallet_pass_style: "event",
    wallet_pass_color: "#00A9E0",
  },
  chile2026: {
    event_name: "BSL Chile 2026",
    event_location: "Santiago, Chile",
    event_starts_at: "2026-08-05T09:00:00-04:00",
    event_ends_at: "2026-08-07T23:59:59-04:00",
    wallet_pass_style: "event",
    wallet_pass_color: "#00A9E0",
  },
  colombia2026: {
    event_name: "Blockchain Summit Latam Colombia 2026",
    event_location: "Bogotá, Colombia",
    event_starts_at: "2026-11-05T09:00:00-05:00",
    event_ends_at: "2026-11-06T23:59:59-05:00",
    wallet_pass_style: "event",
    wallet_pass_color: "#00A9E0",
  },
  bsl2025: {
    event_name: "BSL Colombia 2025",
    event_starts_at: "2025-11-12T09:00:00-05:00",
    event_ends_at: "2025-11-14T23:59:59-05:00",
  },
};

const makePass = (overrides: Partial<PassInfo> = {}): PassInfo => ({
  pass_id: "pass-1",
  pass_type: "general",
  status: "active",
  pass_number: "BSL-GENERAL-0001",
  max_requests: 10,
  used_requests: 0,
  remaining_requests: 10,
  max_boost: 100,
  used_boost: 0,
  remaining_boost: 100,
  access_features: [],
  special_perks: [],
  ...(overrides.event_id ? eventMetadata[overrides.event_id] : {}),
  ...overrides,
});

describe("buildWalletPasses", () => {
  it("uses backend metadata to mark the BSL On Tour hub and 2026 stops as event passes", () => {
    const eventIds = ["bsl", "peru2026", "chile2026", "colombia2026"];
    const passes = buildWalletPasses(
      eventIds.map((eventId) => makePass({ pass_id: eventId, event_id: eventId })),
      AUGUST_1_2026,
    );

    expect(passes).toHaveLength(eventIds.length);
    expect(passes.every((pass) => pass.walletPassStyle === "event")).toBe(true);
    expect(passes.every((pass) => pass.walletPassColor === "#00A9E0")).toBe(true);
  });

  it("leaves non-tour events on the regular pass treatment", () => {
    const [archive] = buildWalletPasses(
      [makePass({ pass_id: "archive", event_id: "bsl2025" })],
      AUGUST_1_2026,
    );

    expect(archive.walletPassStyle).toBeUndefined();
    expect(archive.walletPassColor).toBeUndefined();
  });

  it("classifies passes against the event calendar, not the pass status", () => {
    const [chile] = buildWalletPasses(
      [makePass({ pass_id: "a", event_id: "chile2026" })],
      AUGUST_1_2026,
    );

    expect(chile.timeline).toBe("upcoming");
    expect(chile.eventName).toBe("BSL Chile 2026");
    expect(chile.eventLocation).toBe("Santiago, Chile");
    expect(chile.isArchived).toBe(false);
  });

  it("marks an event as live only while it is actually running", () => {
    const during = buildWalletPasses(
      [makePass({ pass_id: "a", event_id: "chile2026" })],
      AUGUST_6_2026,
    );
    expect(during[0].timeline).toBe("live");
  });

  it("files an event whose end date has passed under past", () => {
    const [archive] = buildWalletPasses(
      [makePass({ pass_id: "a", event_id: "bsl2025" })],
      AUGUST_1_2026,
    );
    expect(archive.timeline).toBe("past");
  });

  it("keeps a cancelled pass on its real calendar position but flags it archived", () => {
    // A cancelled pass for a future event is still a future-event pass; it
    // just isn't usable. Folding status into the timeline would hide it from
    // the "Upcoming" filter where the user expects to find it.
    const [pass] = buildWalletPasses(
      [
        makePass({
          pass_id: "a",
          event_id: "colombia2026",
          status: "cancelled",
        }),
      ],
      AUGUST_1_2026,
    );

    expect(pass.timeline).toBe("upcoming");
    expect(pass.isArchived).toBe(true);
  });

  it("treats an event with no configured dates as upcoming rather than past", () => {
    const [pass] = buildWalletPasses(
      [makePass({ pass_id: "a", event_id: "not-a-configured-event" })],
      AUGUST_1_2026,
    );
    expect(pass.timeline).toBe("upcoming");
  });

  it("orders live first, then soonest upcoming, then most recent past", () => {
    const ordered = buildWalletPasses(
      [
        makePass({ pass_id: "archive", event_id: "bsl2025" }),
        makePass({ pass_id: "colombia", event_id: "colombia2026" }),
        makePass({ pass_id: "chile", event_id: "chile2026" }),
      ],
      AUGUST_6_2026,
    );

    expect(ordered.map((pass: WalletPass) => pass.pass_id)).toEqual([
      "chile",
      "colombia",
      "archive",
    ]);
  });

  it("falls back to an event-derived key when the pass row has no real id", () => {
    // getUserPassInfoFromCounts hands back the literal 'unknown' pass_id;
    // using it as a list key would collide across events.
    const [pass] = buildWalletPasses(
      [makePass({ pass_id: "unknown", event_id: "chile2026" })],
      AUGUST_1_2026,
    );
    expect(pass.id).toBe("chile2026-general");
  });
});

describe("filterWalletPasses", () => {
  const passes = buildWalletPasses(
    [
      makePass({
        pass_id: "chile",
        event_id: "chile2026",
        pass_type: "general",
      }),
      makePass({
        pass_id: "colombia",
        event_id: "colombia2026",
        pass_type: "vip",
      }),
      makePass({
        pass_id: "archive",
        event_id: "bsl2025",
        pass_type: "general",
      }),
    ],
    AUGUST_1_2026,
  );

  it("returns everything when no filters are set", () => {
    expect(filterWalletPasses(passes)).toHaveLength(3);
  });

  it("filters by timeline", () => {
    expect(
      filterWalletPasses(passes, { timeline: "past" }).map(
        (p: WalletPass) => p.pass_id,
      ),
    ).toEqual(["archive"]);
  });

  it("filters by pass type", () => {
    expect(
      filterWalletPasses(passes, { passType: "vip" }).map(
        (p: WalletPass) => p.pass_id,
      ),
    ).toEqual(["colombia"]);
  });

  it("searches across event name, location and pass number", () => {
    expect(
      filterWalletPasses(passes, { query: "bogot" }).map(
        (p: WalletPass) => p.pass_id,
      ),
    ).toEqual(["colombia"]);
    expect(
      filterWalletPasses(passes, { query: "santiago" }).map(
        (p: WalletPass) => p.pass_id,
      ),
    ).toEqual(["chile"]);
    expect(filterWalletPasses(passes, { query: "BSL-GENERAL" })).toHaveLength(
      3,
    );
  });

  it("ignores case and surrounding whitespace in the query", () => {
    expect(
      filterWalletPasses(passes, { query: "  ChIlE  " }).map(
        (p: WalletPass) => p.pass_id,
      ),
    ).toEqual(["chile"]);
  });

  it("combines filters", () => {
    expect(
      filterWalletPasses(passes, {
        timeline: "upcoming",
        passType: "general",
      }).map((p: WalletPass) => p.pass_id),
    ).toEqual(["chile"]);
  });
});

describe("countWalletPasses", () => {
  it("counts each timeline bucket", () => {
    const passes = buildWalletPasses(
      [
        makePass({ pass_id: "chile", event_id: "chile2026" }),
        makePass({ pass_id: "colombia", event_id: "colombia2026" }),
        makePass({ pass_id: "archive", event_id: "bsl2025" }),
      ],
      AUGUST_6_2026,
    );

    expect(countWalletPasses(passes)).toEqual({
      total: 3,
      live: 1,
      upcoming: 1,
      past: 1,
    });
  });
});

describe("filterWalletPassesForExplorer", () => {
  const passes = buildWalletPasses(
    [
      makePass({ pass_id: "chile", event_id: "chile2026" }),
      makePass({
        pass_id: "colombia",
        event_id: "colombia2026",
        pass_type: "vip",
      }),
    ],
    AUGUST_1_2026,
  );

  it("uses Explorer event filters and still searches pass metadata", () => {
    expect(
      filterWalletPassesForExplorer(passes, { eventIds: ["chile2026"] }).map(
        (pass) => pass.pass_id,
      ),
    ).toEqual(["chile"]);
    expect(
      filterWalletPassesForExplorer(passes, {
        eventIds: ["colombia2026"],
        query: "vip",
      }).map((pass) => pass.pass_id),
    ).toEqual(["colombia"]);
  });

  it("applies pass timing and tier selections from the Explorer drawer", () => {
    expect(
      filterWalletPassesForExplorer(passes, { timeline: "upcoming" }).map(
        (pass) => pass.pass_id,
      ),
    ).toEqual(["chile", "colombia"]);
    expect(
      filterWalletPassesForExplorer(passes, { passType: "vip" }).map(
        (pass) => pass.pass_id,
      ),
    ).toEqual(["colombia"]);
  });

  it("keeps an explicitly empty event result empty", () => {
    expect(filterWalletPassesForExplorer(passes, { eventIds: [] })).toEqual([]);
  });
});

describe("getPassTypeAccent", () => {
  it("maps each known pass type to its colour and everything else to grey", () => {
    expect(getPassTypeAccent("general")).toBe("#34A853");
    expect(getPassTypeAccent("business")).toBe("#007AFF");
    expect(getPassTypeAccent("vip")).toBe("#FF9500");
    expect(getPassTypeAccent(undefined)).toBe("#8E8E93");
  });
});

describe("sortWalletPasses", () => {
  const basePastPass: WalletPass = {
    id: "past-1",
    pass_id: "past-1",
    pass_type: "general",
    status: "active",
    pass_number: "PASS-1",
    max_requests: 0,
    used_requests: 0,
    remaining_requests: 0,
    max_boost: 0,
    used_boost: 0,
    remaining_boost: 0,
    access_features: [],
    special_perks: [],
    eventName: "Event",
    eventDateLabel: "",
    eventLocation: "",
    accentColor: "#000",
    timeline: "past",
    startsAt: null,
    endsAt: null,
    isArchived: false,
    searchText: "",
  };

  it("treats a missing endsAt as the oldest possible past event, not a crash", () => {
    // classifyTimeline never actually produces this combination (an event
    // with no configured end date is classified 'upcoming', never 'past'),
    // but sortWalletPasses is exported and doesn't re-derive timeline itself
    // -- a hand-built WalletPass could still reach it, so the `?? 0`
    // fallback here is a real defensive branch worth a direct test rather
    // than only exercising it indirectly through buildWalletPasses.
    const withDate: WalletPass = {
      ...basePastPass,
      id: "past-with-date",
      endsAt: Date.parse("2020-01-01"),
    };
    const withoutDate: WalletPass = {
      ...basePastPass,
      id: "past-without-date",
      endsAt: null,
    };

    expect(
      sortWalletPasses([withoutDate, withDate]).map((p: WalletPass) => p.id),
    ).toEqual(["past-with-date", "past-without-date"]);
  });
});
