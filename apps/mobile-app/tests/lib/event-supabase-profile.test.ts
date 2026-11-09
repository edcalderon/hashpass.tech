import {
  getEventSupabaseProfileId,
  getEventSupabaseProfileIdForRequest,
} from "../../lib/server/event-supabase-profile";
import {
  getSupabaseProfileIdForEventRequest,
  getSupabaseProfileIdForRequest,
} from "../../lib/supabase-server";

describe("event Supabase profile selection", () => {
  it.each(["api-dev.hashpass.tech", "cbweek2026.hashpass.tech"])(
    "keeps CBWeek development requests on the BSL development profile through %s",
    (host) => {
      expect(getEventSupabaseProfileId(
        new Request(`https://${host}/api/admin/roles?eventId=cbweek2026`),
        "cbweek2026",
      )).toBe("bsl-development");
    },
  );

  it.each(["http://localhost:8081", "http://127.0.0.1:8081", "http://0.0.0.0:8081", "http://[::1]:8081"])(
    "keeps local CBWeek API requests on the BSL development profile through %s",
    (apiUrl) => {
      expect(getEventSupabaseProfileId(
        new Request(`${apiUrl}/api/admin/roles?eventId=cbweek2026`),
        "cbweek2026",
      )).toBe("bsl-development");
    },
  );

  it.each(["api.hashpass.tech", "cbweek.hashpass.tech"])(
    "uses core production for CBWeek production requests through %s",
    (host) => {
      expect(getEventSupabaseProfileId(
        new Request(`https://${host}/api/admin/roles?eventId=cbweek2026`),
        "cbweek2026",
      )).toBe("core-production");
    },
  );

  it.each([
    ["https://api.hashpass.tech/api/pass-shares?token=opaque", "https://cbweek2026.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/pass-shares?token=opaque", "https://cbweek.hashpass.tech", "bsl-development"],
    ["http://localhost:8081/api/pass-shares?token=opaque", "https://cbweek.hashpass.tech", "bsl-development"],
  ] as const)(
    "selects the event data profile by API host for opaque routes (%s)",
    (url, origin, profileId) => {
      expect(getEventSupabaseProfileIdForRequest(new Request(url, {
        headers: { origin },
      }))).toBe(profileId);
    },
  );

  it("does not let a development Origin redirect production API access to development data", () => {
    expect(getEventSupabaseProfileId(new Request("https://api.hashpass.tech/api/admin/roles", {
      headers: { origin: "https://cbweek2026.hashpass.tech" },
    }), "cbweek2026")).toBe("core-production");
  });

  it("does not let a production Origin redirect development API access to production data", () => {
    expect(getEventSupabaseProfileId(new Request("https://api-dev.hashpass.tech/api/admin/roles", {
      headers: { origin: "https://cbweek.hashpass.tech" },
    }), "cbweek2026")).toBe("bsl-development");
  });

  it.each([
    ["https://api.hashpass.tech/api/events/cbweek2026/agenda", "https://cbweek2026.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/events/cbweek2026/agenda", "https://cbweek.hashpass.tech", "bsl-development"],
    ["https://api.hashpass.tech/api/bsl/agenda?eventId=cbweek2026", "https://cbweek2026.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/bsl/agenda?eventId=cbweek2026", "https://cbweek.hashpass.tech", "bsl-development"],
    ["https://api.hashpass.tech/api/passes?eventIds=cbweek2026,chile2026", "https://cbweek2026.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/passes?eventIds=cbweek2026,chile2026", "https://cbweek.hashpass.tech", "bsl-development"],
  ] as const)(
    "uses the API host rather than Origin for event-route clients (%s)",
    (requestUrl, origin, profileId) => {
      expect(getSupabaseProfileIdForRequest(new Request(requestUrl, {
        headers: { origin },
      }))).toBe(profileId);
    },
  );

  it.each([
    ["https://api.hashpass.tech/api/pass-transfers", "https://cbweek2026.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/pass-transfers", "https://cbweek.hashpass.tech", "core-development"],
    ["https://api.hashpass.tech/api/bsl/speakers", "https://cbweek2026.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/bsl/speakers", "https://cbweek.hashpass.tech", "bsl-development"],
  ] as const)(
    "uses the first-party API host for unscoped clients (%s)",
    (requestUrl, origin, profileId) => {
      expect(getSupabaseProfileIdForRequest(new Request(requestUrl, {
        headers: { origin },
      }))).toBe(profileId);
    },
  );

  it("uses the API request hostname for non-CBWeek BSL events too", () => {
    expect(getEventSupabaseProfileId(new Request("https://api-dev.hashpass.tech/api/events/peru2026/agenda", {
      headers: { origin: "https://hashpass.tech" },
    }), "peru2026")).toBe("bsl-development");
  });

  it.each([
    ["https://api.hashpass.tech/api/passes", "https://cbweek2026.hashpass.tech", "cbweek2026", "core-production"],
    ["https://api-dev.hashpass.tech/api/passes", "https://cbweek.hashpass.tech", "cbweek2026", "bsl-development"],
  ] as const)(
    "resolves body-scoped event requests from the API host (%s)",
    (requestUrl, origin, eventId, profileId) => {
      expect(getSupabaseProfileIdForEventRequest(new Request(requestUrl, {
        headers: { origin },
      }), eventId)).toBe(profileId);
    },
  );

  it("preserves explicit profile overrides for existing event admin flows", () => {
    expect(getSupabaseProfileIdForRequest(
      new Request("https://api.hashpass.tech/api/events/cbweek2026/admin"),
      "bsl-development",
    )).toBe("bsl-development");
  });

  it("uses the core production profile for an on-tour event on the production host", () => {
    expect(
      getEventSupabaseProfileId(
        new Request("https://api.hashpass.tech/api/events/chile2026/auth-allies"),
        "chile2026",
      ),
    ).toBe("core-production");
  });
});
