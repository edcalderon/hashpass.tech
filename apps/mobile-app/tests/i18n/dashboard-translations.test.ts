import en from "../../i18n/locales/en.json";
import es from "../../i18n/locales/es.json";
import ko from "../../i18n/locales/ko.json";

const dashboardExplorerKeys = [
  "explore.rework.search",
  "explore.rework.searchDiscovery",
  "explore.rework.discoverySummary",
  "explore.rework.events",
  "explore.rework.passes",
  "explore.rework.eventsAttending",
  "explore.rework.activePasses",
  "explore.rework.eventsWithPass",
  "explore.rework.eventBannerSlides",
  "explore.rework.showEventBanner",
  "explore.rework.loadingEventFilm",
  "explore.rework.clfFilmEyebrow",
  "explore.rework.clfSubtitle",
  "explore.rework.clfDate",
  "explore.rework.clfExplore",
  "explore.rework.allEvents",
  "explore.rework.showing",
  "explore.rework.eventsAcross",
  "explore.rework.sortedBy",
  "explore.rework.all",
  "explore.rework.upcoming",
  "explore.rework.cities",
  "explore.rework.series",
  "explore.rework.loadingMore",
  "explore.rework.allCaughtUp",
  "explore.rework.yourPasses",
  "explore.rework.closeSearch",
  "explore.rework.recent",
  "explore.rework.suggestions",
  "explore.rework.filters",
  "explore.rework.reset",
  "explore.rework.filterEvents",
  "explore.rework.filterPasses",
  "explore.rework.when",
  "explore.rework.passTiming",
  "explore.rework.allPasses",
  "explore.rework.allPassTypes",
  "explore.rework.happeningNow",
  "explore.rework.passType",
  "explore.rework.passGeneral",
  "explore.rework.passBusiness",
  "explore.rework.passVip",
  "explore.rework.showEvents",
  "explore.rework.showPasses",
  "explore.rework.filtersApplied",
  "explore.rework.fromDate",
  "explore.rework.toDate",
  "explore.rework.access",
  "explore.rework.onlyPasses",
  "explore.rework.sortBy",
  "explore.rework.noEventsMatch",
  "explore.rework.noEventsHint",
  "explore.rework.clearAllFilters",
  "explore.rework.eventPagination",
  "explore.rework.previousEventsPage",
  "explore.rework.previous",
  "explore.rework.pageOf",
  "explore.rework.nextEventsPage",
  "explore.rework.next",
];

const getValue = (catalog: Record<string, unknown>, key: string) =>
  key.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, catalog);

describe("dashboard explorer translations", () => {
  it.each([
    ["en", en],
    ["es", es],
    ["ko", ko],
  ])("contains every Explorer rework message in %s", (_locale, catalog) => {
    for (const key of dashboardExplorerKeys) {
      expect(getValue(catalog as Record<string, unknown>, key)).toEqual(
        expect.any(String),
      );
    }
  });
});
