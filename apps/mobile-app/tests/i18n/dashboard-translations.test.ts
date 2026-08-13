import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import ko from '../../i18n/locales/ko.json';

const dashboardExplorerKeys = [
  'explore.rework.search',
  'explore.rework.allEvents',
  'explore.rework.showing',
  'explore.rework.eventsAcross',
  'explore.rework.sortedBy',
  'explore.rework.all',
  'explore.rework.upcoming',
  'explore.rework.cities',
  'explore.rework.series',
  'explore.rework.loadingMore',
  'explore.rework.allCaughtUp',
  'explore.rework.yourPasses',
  'explore.rework.closeSearch',
  'explore.rework.recent',
  'explore.rework.suggestions',
  'explore.rework.filters',
  'explore.rework.reset',
  'explore.rework.when',
  'explore.rework.fromDate',
  'explore.rework.toDate',
  'explore.rework.access',
  'explore.rework.onlyPasses',
  'explore.rework.sortBy',
  'explore.rework.noEventsMatch',
  'explore.rework.noEventsHint',
  'explore.rework.clearAllFilters',
];

const getValue = (catalog: Record<string, unknown>, key: string) =>
  key.split('.').reduce<unknown>((value, part) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[part];
  }, catalog);

describe('dashboard explorer translations', () => {
  it.each([
    ['en', en],
    ['es', es],
    ['ko', ko],
  ])('contains every Explorer rework message in %s', (_locale, catalog) => {
    for (const key of dashboardExplorerKeys) {
      expect(getValue(catalog as Record<string, unknown>, key)).toEqual(
        expect.any(String),
      );
    }
  });
});
