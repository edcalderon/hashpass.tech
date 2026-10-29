import React from 'react';
import { act, create } from 'react-test-renderer';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import ko from '../../i18n/locales/ko.json';
import fr from '../../i18n/locales/fr.json';
import pt from '../../i18n/locales/pt.json';
import de from '../../i18n/locales/de.json';
import et from '../../i18n/locales/et.json';
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: { text: { primary: '#111', secondary: '#555' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/PlatformStoryCards', () => 'PlatformStoryCards');
import PlatformStory from '../../components/PlatformStory';
function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (!value || typeof value !== 'object') return prefix ? { [prefix]: value } : {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return item && typeof item === 'object' ? Object.entries(flatten(item, path)) : [[path, item]];
  }));
}
const catalogs = { en, es, ko, fr, pt, de };
it.each(Object.entries(catalogs))('has complete nonempty landing copy for %s', (_locale, catalog) => {
  const expected = flatten({ index: en.index, newsletter: en.newsletter, publicEvents: en.publicEvents });
  const actual = flatten({ index: catalog.index, newsletter: catalog.newsletter, publicEvents: catalog.publicEvents });
  for (const key of Object.keys(expected).filter(key => !key.startsWith('index.docs.'))) {
    expect({ key, value: actual[key] }).toEqual({ key, value: expect.stringMatching(/\S/) });
  }
  for (const id of ['scan', 'allies', 'meet', 'rewards']) {
    expect(actual[`index.howItWorks.cards.${id}.title`]).not.toBe(id);
  }
});
it('renders nine localized platform capabilities without testimonial identities', () => {
  let view: ReturnType<typeof create>;
  act(() => { view = create(<PlatformStory />); });
  const stories = view!.root.findByType('PlatformStoryCards' as any).props.stories;
  expect(stories.map(({ id }: { id: string }) => id)).toEqual([
    'lifecycle', 'membership', 'eventTools', 'sharingTools', 'surfaces',
    'languages', 'truthful', 'private', 'open',
  ]);
  expect(stories.every(({ metricValue, metric }: { metricValue: string; metric: string }) => metricValue && metric)).toBe(true);
  expect('testimonials' in en.index).toBe(false);
  act(() => view!.unmount());
});

it('provides localized platform-story copy for Estonian', () => {
  const story = et.index.platformStory;
  expect(story.eyebrow).toBeTruthy();
  expect(story.title).toBeTruthy();
  expect(story.description).toBeTruthy();
  expect(Object.values(story.cards)).toHaveLength(9);
  for (const card of Object.values(story.cards) as Array<{ eyebrow: string; title: string; description: string }>) {
    expect(card.eyebrow).toBeTruthy();
    expect(card.title).toBeTruthy();
    expect(card.description).toBeTruthy();
  }
});
