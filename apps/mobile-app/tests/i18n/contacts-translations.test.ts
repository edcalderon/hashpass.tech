import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import ko from '../../i18n/locales/ko.json';

const flatten = (value: Record<string, unknown>, prefix = ''): Record<string, string> => Object.fromEntries(
  Object.entries(value).flatMap(([key, item]) => typeof item === 'string'
    ? [[prefix + key, item]]
    : Object.entries(flatten(item as Record<string, unknown>, `${prefix}${key}.`))),
);

describe('Contacts language support', () => {
  it.each([['Spanish', es], ['Korean', ko]])('provides all %s messages and preserves interpolation values', (_name, catalog) => {
    const english = flatten(en.contacts);
    const translated = flatten(catalog.contacts);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    for (const [key, message] of Object.entries(english)) {
      expect(translated[key].trim().length).toBeGreaterThan(0);
      expect((translated[key].match(/\{\w+\}/g) ?? []).sort()).toEqual((message.match(/\{\w+\}/g) ?? []).sort());
    }
    expect(catalog.nav.contacts.length).toBeGreaterThan(0);
  });
});
