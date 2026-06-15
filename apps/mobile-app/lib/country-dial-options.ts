import {
  getCountries as getCountriesCore,
  getCountryCallingCode as getCountryCallingCodeCore,
  type CountryCode,
} from 'libphonenumber-js/core';
import metadataSource from 'libphonenumber-js/metadata.min';

export type CountryDialOption = {
  iso2: string;
  name: string;
  dialCode: string;
  searchValue: string;
};

type RegionDisplayNames = {
  of: (code: string) => string | undefined;
};

const metadata = (metadataSource as any)?.default ?? metadataSource;

function getCountries(): CountryCode[] {
  return getCountriesCore(metadata);
}

function getCountryCallingCode(countryCode: CountryCode): string {
  return getCountryCallingCodeCore(countryCode, metadata);
}

function getRegionDisplayNames(locale: string): RegionDisplayNames | null {
  const displayNamesCtor = (Intl as any)?.DisplayNames;
  if (typeof displayNamesCtor !== 'function') return null;

  try {
    return new displayNamesCtor([locale], { type: 'region' }) as RegionDisplayNames;
  } catch {
    return null;
  }
}

function extractRegionFromLocale(locale: string | undefined): string | null {
  if (!locale) return null;
  const match = locale.match(/[-_]([a-zA-Z]{2})$/);
  return match ? match[1].toUpperCase() : null;
}

export function resolveDefaultCountryISO2(
  options: CountryDialOption[],
  localeHint?: string
): string {
  const optionSet = new Set(options.map((option) => option.iso2));
  const candidates = [
    localeHint,
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : undefined,
    typeof navigator !== 'undefined' ? navigator.language : undefined,
    'en-US',
  ];

  for (const candidate of candidates) {
    const region = extractRegionFromLocale(candidate);
    if (region && optionSet.has(region)) {
      return region;
    }
  }

  return optionSet.has('US') ? 'US' : options[0]?.iso2 || 'US';
}

export function buildCountryDialOptions(locale = 'en'): CountryDialOption[] {
  const localizedNames = getRegionDisplayNames(locale);
  const fallbackNames = locale.toLowerCase().startsWith('en') ? localizedNames : getRegionDisplayNames('en');
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });

  const options: CountryDialOption[] = [];

  for (const countryCode of getCountries()) {
    let dialCode = '';
    try {
      dialCode = getCountryCallingCode(countryCode);
    } catch {
      continue;
    }

    const countryName =
      localizedNames?.of(countryCode) ||
      fallbackNames?.of(countryCode) ||
      countryCode;
    const iso2 = countryCode.toUpperCase();
    const codeWithPlus = `+${dialCode}`;
    const searchValue = `${countryName} ${iso2} ${dialCode} ${codeWithPlus}`.toLowerCase();

    options.push({
      iso2,
      name: countryName,
      dialCode,
      searchValue,
    });
  }

  return options.sort((left, right) => collator.compare(left.name, right.name));
}

export function filterCountryDialOptions(
  options: CountryDialOption[],
  query: string
): CountryDialOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return options;

  const digitsOnly = normalizedQuery.replace(/\D/g, '');

  return options.filter((option) => {
    if (option.searchValue.includes(normalizedQuery)) return true;
    if (digitsOnly && option.dialCode.startsWith(digitsOnly)) return true;
    return false;
  });
}
