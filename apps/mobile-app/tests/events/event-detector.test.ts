/// <reference types="jest" />

import {
  getAvailableEvents,
  getCurrentEvent,
  getEventTenantContext,
  getRouteEventIdFromPathname,
  isGlobalEventTenant,
} from "../../lib/event-detector";
import { EVENTS } from "../../config/events";

const envBackup: Record<string, string | undefined> = {};

const setEnv = (name: string, value?: string) => {
  if (!(name in envBackup)) {
    envBackup[name] = process.env[name];
  }

  if (typeof value === "string") {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
};

const restoreEnv = () => {
  for (const [name, value] of Object.entries(envBackup)) {
    if (typeof value === "string") {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  }

  for (const key of Object.keys(envBackup)) {
    delete envBackup[key];
  }
};

afterEach(() => {
  restoreEnv();
});

describe("event tenant detection", () => {
  it("treats hashpass.tech as the global HASHPASS event explorer", () => {
    const tenant = getEventTenantContext("hashpass.tech");
    const events = getAvailableEvents("hashpass.tech").map(
      (event: { id: string }) => event.id,
    );

    expect(tenant.id).toBe("main");
    expect(tenant.showAllEvents).toBe(true);
    expect(isGlobalEventTenant("hashpass.tech")).toBe(true);
    expect(events).toEqual([
      "bsl",
      "peru2026",
      "chile2026",
      "colombia2026",
      "bsl2025",
      "hash-poker",
    ]);
  });

  it("scopes bsl.hashpass.tech to the BSL event family via shared tenant config", () => {
    setEnv("EXPO_PUBLIC_EVENT_TENANT", "main");

    const tenant = getEventTenantContext("bsl.hashpass.tech");
    const events = getAvailableEvents("bsl.hashpass.tech").map(
      (event: { id: string }) => event.id,
    );

    expect(tenant.id).toBe("bsl");
    expect(tenant.source).toBe("config");
    expect(tenant.showAllEvents).toBe(false);
    expect(events).toEqual([
      "bsl",
      "peru2026",
      "chile2026",
      "colombia2026",
      "bsl2025",
    ]);
  });

  it("scopes bsl2025.hashpass.tech to the BSL 2025 event family via shared tenant config", () => {
    setEnv("EXPO_PUBLIC_EVENT_TENANT", "main");

    const tenant = getEventTenantContext("bsl2025.hashpass.tech");
    const events = getAvailableEvents("bsl2025.hashpass.tech").map(
      (event: { id: string }) => event.id,
    );

    expect(tenant.id).toBe("bsl2025");
    expect(tenant.source).toBe("config");
    expect(tenant.showAllEvents).toBe(false);
    expect(events).toEqual(["bsl2025"]);
  });

  it("can test the BSL tenant on localhost with EXPO_PUBLIC_EVENT_TENANT", () => {
    setEnv("EXPO_PUBLIC_EVENT_TENANT", "bsl");

    const tenant = getEventTenantContext("localhost");
    const events = getAvailableEvents("localhost").map(
      (event: { id: string }) => event.id,
    );

    expect(tenant.id).toBe("bsl");
    expect(tenant.source).toBe("env-tenant");
    expect(events).toEqual([
      "bsl",
      "peru2026",
      "chile2026",
      "colombia2026",
      "bsl2025",
    ]);
  });

  it("supports exact local event filtering with EXPO_PUBLIC_EVENT_IDS", () => {
    setEnv("EXPO_PUBLIC_EVENT_TENANT", "main");
    setEnv("EXPO_PUBLIC_EVENT_IDS", "bsl2025");

    const tenant = getEventTenantContext("localhost:8081");
    const events = getAvailableEvents("localhost:8081").map(
      (event: { id: string }) => event.id,
    );

    expect(tenant.source).toBe("env-event-ids");
    expect(events).toEqual(["bsl2025"]);
    expect(getCurrentEvent("bsl", "localhost:8081")).toBeNull();
    expect(getCurrentEvent("bsl2025", "localhost:8081")?.id).toBe("bsl2025");
  });

  it("resolves CLF aliases and exposes the event short name", () => {
    setEnv("EXPO_PUBLIC_EVENT_TENANT", "CLF");

    expect(getEventTenantContext("localhost").id).toBe("criptolatinfest");
    expect(
      getAvailableEvents("localhost").map((event: { id: string }) => event.id),
    ).toEqual(["criptolatinfest"]);
    expect(EVENTS.criptolatinfest.shortName).toBe("CLF");
    expect(EVENTS.criptolatinfest.aliases).toContain("CriptoLatinFest");
    expect(EVENTS.criptolatinfest.bannerSlides).toHaveLength(2);
    expect(EVENTS.criptolatinfest.bannerSlides?.[0]).toMatchObject({
      media: { type: "video" },
      durationMs: 30_000,
    });
  });

  it("keeps the CLF demo available only on its own tenant", () => {
    const tenant = getEventTenantContext("demo-criptolatinfest.hashpass.tech");

    expect(tenant.id).toBe("criptolatinfest");
    expect(
      getAvailableEvents("demo-criptolatinfest.hashpass.tech").map(
        (event: { id: string }) => event.id,
      ),
    ).toEqual(["criptolatinfest"]);
    expect(
      getAvailableEvents("hashpass.tech").some(
        (event: { id: string }) => event.id === "criptolatinfest",
      ),
    ).toBe(false);
  });

  it("shows demo events in the global explorer only when SHOW_DEMO_EVENTS is enabled", () => {
    setEnv("SHOW_DEMO_EVENTS", "true");

    expect(
      getAvailableEvents("hashpass.tech").some(
        (event: { id: string }) => event.id === "criptolatinfest",
      ),
    ).toBe(true);
  });

  it("resolves route slugs to event ids for route-aware event pages", () => {
    expect(getRouteEventIdFromPathname("/events/peru2026/agenda")).toBe(
      "peru2026",
    );
    expect(
      getRouteEventIdFromPathname("/events/chile2026/speakers/calendar"),
    ).toBe("chile2026");
  });

  describe("includeAllTenants (Settings 'show all events' opt-in)", () => {
    it("expands a whitelabel tenant to the full global catalogue", () => {
      const events = getAvailableEvents("bsl.hashpass.tech", {
        includeAllTenants: true,
      }).map((event: { id: string }) => event.id);

      expect(events).toContain("hash-poker");
    });

    it("keeps the requesting demo tenant's own event even though it is demo-flagged", () => {
      const events = getAvailableEvents("demo-criptolatinfest.hashpass.tech", {
        includeAllTenants: true,
      }).map((event: { id: string }) => event.id);

      expect(events).toContain("criptolatinfest");
      expect(events).toContain("bsl");
    });

    it("still hides other tenants' demo events when SHOW_DEMO_EVENTS is unset", () => {
      // criptolatinfest is the only demo event today; assert the general
      // policy holds by checking a non-owning tenant's expanded catalogue
      // never leaks a foreign demo event without SHOW_DEMO_EVENTS.
      const events = getAvailableEvents("bsl.hashpass.tech", {
        includeAllTenants: true,
      }).map((event: { id: string }) => event.id);

      expect(events).not.toContain("criptolatinfest");
    });

    it("has no effect on the already-global main tenant", () => {
      const withOption = getAvailableEvents("hashpass.tech", {
        includeAllTenants: true,
      }).map((event: { id: string }) => event.id);
      const withoutOption = getAvailableEvents("hashpass.tech").map(
        (event: { id: string }) => event.id,
      );

      expect(withOption).toEqual(withoutOption);
      expect(withOption).not.toContain("criptolatinfest");
    });

    it("resolves a foreign tenant's event via getCurrentEvent when opted in", () => {
      expect(
        getCurrentEvent("bsl", "demo-criptolatinfest.hashpass.tech"),
      ).toBeNull();

      const resolved = getCurrentEvent(
        "bsl",
        "demo-criptolatinfest.hashpass.tech",
        { includeAllTenants: true },
      );
      expect(resolved?.id).toBe("bsl");
    });

    it("falls back to the global default event, not the narrow tenant, when opted in with no eventId", () => {
      const resolved = getCurrentEvent(
        undefined,
        "demo-criptolatinfest.hashpass.tech",
        { includeAllTenants: true },
      );

      expect(resolved?.id).toBe("default");
    });
  });
});
