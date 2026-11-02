import type { EventConfig } from "@hashpass/types";
import {
  createAdminEventOptions,
  filterAdminEventOptions,
  getPreferredAdminEventId,
} from "../../lib/admin-event-selector";

const NOW = Date.parse("2026-11-02T12:00:00-05:00");

const event = (
  id: string,
  start?: string,
  end?: string,
  options: { hubEventId?: string; role?: "hub" | "stop"; city?: string } = {},
) =>
  ({
    id,
    name: id,
    title: id,
    subtitle: "",
    image: "",
    domain: `${id}.example.test`,
    features: [],
    color: "#000000",
    branding: { primaryColor: "#000000", logo: "" },
    api: { basePath: "", endpoints: {} },
    routes: { home: "", speakers: "", bookings: "" },
    series:
      options.role === "hub" || options.hubEventId ? "BSL On Tour" : undefined,
    eventStartDate: start,
    eventEndDate: end,
    eventDateString: id === "colombia2026" ? "Bogotá · Nov 4–6, 2026" : id,
    tour:
      options.role || options.hubEventId
        ? {
            role: options.role,
            hubEventId: options.hubEventId,
            city: options.city,
            country: "Colombia",
          }
        : undefined,
    geo: options.city
      ? { city: options.city, country: "Colombia", continent: "South America" }
      : undefined,
  }) as EventConfig;

const events = {
  bsl: event("bsl", undefined, undefined, { role: "hub" }),
  peru2026: event(
    "peru2026",
    "2026-05-13T09:00:00-05:00",
    "2026-05-15T23:59:59-05:00",
    { hubEventId: "bsl", role: "stop", city: "Lima" },
  ),
  chile2026: event(
    "chile2026",
    "2026-08-05T09:00:00-04:00",
    "2026-08-07T23:59:59-04:00",
    { hubEventId: "bsl", role: "stop", city: "Santiago" },
  ),
  colombia2026: event(
    "colombia2026",
    "2026-11-04T08:00:00-05:00",
    "2026-11-06T23:59:59-05:00",
    { hubEventId: "bsl", role: "stop", city: "Bogotá" },
  ),
  cbweek2026: event(
    "cbweek2026",
    "2026-12-11T09:00:00-05:00",
    "2026-12-12T23:59:59-05:00",
  ),
};

describe("admin event selector options", () => {
  const options = createAdminEventOptions(events, NOW);

  it("shows upcoming events and their series hub before past events by default", () => {
    expect(
      filterAdminEventOptions(options, "upcoming", "", NOW).map(
        ({ eventId }) => eventId,
      ),
    ).toEqual(["bsl", "colombia2026", "cbweek2026"]);
  });

  it("filters past stops and searches accented locations without accents", () => {
    expect(
      filterAdminEventOptions(options, "past", "", NOW).map(
        ({ eventId }) => eventId,
      ),
    ).toEqual(["chile2026", "peru2026"]);
    expect(
      filterAdminEventOptions(options, "upcoming", "bogota", NOW).map(
        ({ eventId }) => eventId,
      ),
    ).toEqual(["colombia2026"]);
  });

  it("defaults a past selection to the next specific event and preserves a requested event", () => {
    expect(getPreferredAdminEventId("chile2026", options, NOW)).toBe(
      "colombia2026",
    );
    expect(getPreferredAdminEventId("bsl", options, NOW)).toBe("bsl");
  });
});
