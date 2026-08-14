import {
  filterExplorerEvents,
  getExplorerEventStatus,
  getExplorerHeroActionTarget,
  getExplorerLayout,
  EXPLORER_HERO_LAYOUT,
  getExplorerScopeLabel,
  getEventRoomTarget,
  getActiveFilterCount,
  sortExplorerEvents,
  type ExplorerEvent,
} from "../../components/explorer/explorer";

const events: ExplorerEvent[] = [
  {
    id: "peru2026",
    title: "Blockchain Summit Latam Perú 2026",
    subtitle: "Lima, Perú",
    eventDateString: "May 13–15, 2026",
    eventStartDate: "2026-05-13T09:00:00-05:00",
    eventEndDate: "2026-05-15T23:59:59-05:00",
    color: "#E31B32",
    continent: "South America",
    tourRole: "stop",
  },
  {
    id: "chile2026",
    title: "Blockchain Summit Latam Chile 2026",
    subtitle: "Santiago, Chile",
    eventDateString: "August 5–7, 2026",
    eventStartDate: "2026-08-05T09:00:00-04:00",
    eventEndDate: "2026-08-07T23:59:59-04:00",
    color: "#FF5B5B",
    continent: "South America",
    tourRole: "stop",
  },
  {
    id: "bsl2025",
    title: "Blockchain Summit Latam 2025",
    subtitle: "Medellín, Colombia",
    eventDateString: "November 12–14, 2025",
    eventStartDate: "2025-11-12T09:00:00-05:00",
    eventEndDate: "2025-11-14T23:59:59-05:00",
    color: "#2D9CDB",
    continent: "South America",
    tourRole: "archive",
  },
];

describe("explorer rework behavior", () => {
  it("searches across event titles, locations, and dates without mutating the source list", () => {
    const result = filterExplorerEvents(events, { query: "santiago" });

    expect(result.map((event) => event.id)).toEqual(["chile2026"]);
    expect(events).toHaveLength(3);
  });

  it("can hide archived events while keeping the default catalog complete", () => {
    expect(filterExplorerEvents(events, {}).map((event) => event.id)).toEqual([
      "peru2026",
      "chile2026",
      "bsl2025",
    ]);
    expect(
      filterExplorerEvents(
        events,
        { includePast: false },
        Date.parse("2026-08-12T12:00:00Z"),
      ).map((event) => event.id),
    ).toEqual([]);
  });

  it("classifies Peru and Chile as past while Colombia remains upcoming", () => {
    expect(
      getExplorerEventStatus(events[0], Date.parse("2026-08-12T12:00:00Z")),
    ).toBe("past");
    expect(
      getExplorerEventStatus(events[1], Date.parse("2026-08-12T12:00:00Z")),
    ).toBe("past");
    expect(
      getExplorerEventStatus(
        {
          eventStartDate: "2026-11-05T09:00:00-05:00",
          eventEndDate: "2026-11-06T23:59:59-05:00",
          tourRole: "stop",
        },
        Date.parse("2026-08-12T12:00:00Z"),
      ),
    ).toBe("upcoming");
  });

  it("describes the three mobile layout modes with native-friendly sizing", () => {
    expect(getExplorerLayout("list")).toMatchObject({
      columns: 1,
      coverSize: 132,
    });
    expect(getExplorerLayout("grid")).toMatchObject({
      columns: 3,
      coverSize: 126,
    });
    expect(getExplorerLayout("rail")).toMatchObject({
      columns: 1,
      horizontal: true,
      cardWidth: 250,
    });
  });

  it("keeps the native hero content close to the top bar with balanced spacing", () => {
    expect(EXPLORER_HERO_LAYOUT).toEqual({
      height: 360,
      contentTopInset: 28,
      contentBottomInset: 58,
      progressBottomInset: 18,
    });
  });

  it("pins bookmarked events before sorting the remaining catalog by date", () => {
    expect(
      sortExplorerEvents(events, ["bsl2025"]).map((event) => event.id),
    ).toEqual(["bsl2025", "peru2026", "chile2026"]);
  });

  it("uses the actual event geography for Explorer scope copy", () => {
    expect(getExplorerScopeLabel(events)).toBe("Latam");
    expect(
      getExplorerScopeLabel([
        ...events,
        { ...events[0], id: "new-york", continent: "North America" },
      ]),
    ).toBe("America");
    expect(
      getExplorerScopeLabel([
        ...events,
        { ...events[0], id: "london", continent: "Europe" },
      ]),
    ).toBe("the world");
  });

  it("counts only active filters for the filter badge", () => {
    expect(getActiveFilterCount({ query: "", includePast: true })).toBe(0);
    expect(getActiveFilterCount({ query: "peru", includePast: false })).toBe(2);
  });

  it("routes pass and tour hero actions to their distinct destinations", () => {
    expect(getExplorerHeroActionTarget("Get your pass")).toEqual({
      route: "/(shared)/dashboard/explore?eventId=colombia2026",
      eventId: "colombia2026",
    });
    expect(getExplorerHeroActionTarget("Explore the tour")).toEqual({
      route: "/(shared)/dashboard/explore?tour=bsl-on-tour",
    });
    expect(getExplorerHeroActionTarget("Unknown action")).toBeNull();
  });

  it("opens the room screen before any protected chat request", () => {
    expect(getEventRoomTarget("bsl2025")).toEqual({
      pathname: "/dashboard/event-chat",
      params: { eventId: "bsl2025" },
    });
  });
});
