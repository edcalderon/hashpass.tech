import { getEventSupabaseProfileId } from "../../lib/server/event-supabase-profile";

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

  it("uses the core production profile for an on-tour event on the production host", () => {
    expect(
      getEventSupabaseProfileId(
        new Request("https://api.hashpass.tech/api/events/chile2026/auth-allies"),
        "chile2026",
      ),
    ).toBe("core-production");
  });
});
