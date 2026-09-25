import React from 'react';
import { act, create } from 'react-test-renderer';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import ko from '../../i18n/locales/ko.json';
import fr from '../../i18n/locales/fr.json';
import pt from '../../i18n/locales/pt.json';
import de from '../../i18n/locales/de.json';
import testimonials from '../../i18n/locales/testimonials.json';
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: { text: { primary: '#111' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/TestimonialsColumns', () => 'TestimonialColumn');
import Testimonials from '../../components/Testimonials';
function flatten(value: Record<string, any>, prefix = ''): Record<string, unknown> {
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
it('updates testimonials to the selected language instead of mixing every catalog', () => {
  let view: ReturnType<typeof create>;
  act(() => { view = create(<Testimonials locale="fr" />); });
  expect(view!.root.findByType('TestimonialColumn' as any).props.testimonials).toEqual(testimonials.fr.slice(0, 4));
  act(() => view!.update(<Testimonials locale="de" />));
  expect(view!.root.findByType('TestimonialColumn' as any).props.testimonials).toEqual(testimonials.de.slice(0, 4));
  act(() => view!.unmount());
});
