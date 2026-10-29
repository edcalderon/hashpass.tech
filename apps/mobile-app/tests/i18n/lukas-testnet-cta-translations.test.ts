jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/locales/en.json', () => ({}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/locales/es.json', () => ({}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/locales/ko.json', () => ({}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/locales/fr.json', () => ({}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/locales/pt.json', () => ({}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/locales/de.json', () => ({}), { virtual: true });

import { getAvailableLocales, i18n, setLocale } from '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/i18n';

const ctaTranslations = [
  ['en', 'Keep exploring the LUKAS testnet'],
  ['es', 'Sigue explorando la testnet de LUKAS'],
  ['ko', 'LUKAS 테스트넷 계속 둘러보기'],
  ['fr', 'Continuer à explorer le testnet LUKAS'],
  ['pt', 'Continue explorando a testnet da LUKAS'],
  ['de', 'Das LUKAS-Testnet weiter erkunden'],
] as const;

describe('LUKAS testnet CTA translations', () => {
  afterAll(async () => { await setLocale('en'); });

  it.each(ctaTranslations)('selects the CTA copy for %s', async (locale, expected) => {
    await setLocale(locale);

    expect((i18n as any)._('lukas.getLukas.exploreTestnet')).toBe(expected);
  });

  it('covers every language offered by the LUKAS language switcher', () => {
    expect(getAvailableLocales().map((locale: { code: string }) => locale.code).sort()).toEqual(
      ctaTranslations.map(([locale]) => locale).sort(),
    );
  });
});
