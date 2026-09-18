import { getEventSupabaseProfileId } from "../../lib/server/event-supabase-profile";

describe("event Supabase profile selection", () => {
  it.each(["api.hashpass.tech", "api-dev.hashpass.tech", "cbweek2026.hashpass.tech"])("keeps CBWeek admin access on its tenant database through %s", (host) => {
    expect(getEventSupabaseProfileId(
      new Request(`https://${host}/api/admin/roles?eventId=cbweek2026`),
      "cbweek2026",
    )).toBe("bsl-development");
  });

  it("keeps CBWeek's database when the shared API receives the browser Origin", () => {
    expect(getEventSupabaseProfileId(new Request("https://api.hashpass.tech/api/admin/roles", {
      headers: { origin: "https://cbweek2026.hashpass.tech" },
    }), "cbweek2026")).toBe("bsl-development");
  });

  it("keeps the CriptoLatinFest demo tenant on the BSL development database", () => {
    expect(
      getEventSupabaseProfileId(
        new Request("https://api-dev.hashpass.tech/api/events/criptolatinfest/auth-allies"),
        "criptolatinfest",
      ),
    ).toBe("bsl-development");
  });

  it("uses the BSL production profile for an on-tour event on the production host", () => {
    expect(
      getEventSupabaseProfileId(
        new Request("https://api.hashpass.tech/api/events/chile2026/auth-allies"),
        "chile2026",
      ),
    ).toBe("bsl-production");
  });
});
