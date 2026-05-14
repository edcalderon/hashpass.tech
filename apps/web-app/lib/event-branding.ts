import { Image, type ImageSourcePropType } from 'react-native';

const BSL_ONTOUR_LOGO = require('../assets/logos/bsl/bsl-ontour-pro.svg');
const BSL_PERU_LOGO = require('../assets/logos/bsl/bsl-peru-pro.svg');
const BSL_CHILE_LOGO = require('../assets/logos/bsl/bsl-chile-pro.svg');
const BSL_COLOMBIA_LOGO = require('../assets/logos/bsl/bsl-colombia-pro.svg');
const BSL_ARCHIVE_LOGO = require('../assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.svg');
const BSL_PLAIN_LOGO = require('../assets/logos/bsl/bsl-white.png');
const HASHPASS_DARK_LOGO = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg');
const HASHPASS_LIGHT_LOGO = require('../assets/logos/hashpass/logo-full-hashpass-black.svg');

export interface TourBrandAsset {
  logo: ImageSourcePropType;
  label: string;
  accentColor: string;
}

export interface LampBrandConfig {
  logoSrcDark?: string;
  logoSrcLight?: string;
  logoFallbackSrc?: string;
  logoAlt: string;
}

const TOUR_BRAND_ASSETS: Record<string, TourBrandAsset> = {
  bsl: {
    logo: BSL_ONTOUR_LOGO,
    label: 'BSL On Tour',
    accentColor: '#34D399',
  },
  peru2026: {
    logo: BSL_PERU_LOGO,
    label: 'BSL Perú 2026',
    accentColor: '#D11A2A',
  },
  chile2026: {
    logo: BSL_CHILE_LOGO,
    label: 'BSL Chile 2026',
    accentColor: '#FF5B5B',
  },
  colombia2026: {
    logo: BSL_COLOMBIA_LOGO,
    label: 'BSL Colombia 2026',
    accentColor: '#F5C542',
  },
  bsl2025: {
    logo: BSL_ARCHIVE_LOGO,
    label: 'BSL 2025 Archive',
    accentColor: '#60A5FA',
  },
};

const EVENT_IMAGE_ASSETS: Record<string, ImageSourcePropType> = {
  '/assets/logos/bsl/bsl-ontour-pro.svg': BSL_ONTOUR_LOGO,
  '/assets/logos/bsl/bsl-peru-pro.svg': BSL_PERU_LOGO,
  '/assets/logos/bsl/bsl-chile-pro.svg': BSL_CHILE_LOGO,
  '/assets/logos/bsl/bsl-colombia-pro.svg': BSL_COLOMBIA_LOGO,
  '/assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.svg': BSL_ARCHIVE_LOGO,
  '/assets/logos/bsl/bsl-white.png': BSL_PLAIN_LOGO,
  '/assets/logos/hashpass/logo-full-hashpass-white-cyan.svg': HASHPASS_DARK_LOGO,
  '/assets/logos/hashpass/logo-full-hashpass-black.svg': HASHPASS_LIGHT_LOGO,
};

const resolveUri = (assetModule: ImageSourcePropType): string | undefined => {
  try {
    const resolved = Image.resolveAssetSource(assetModule);
    return typeof resolved?.uri === 'string' ? resolved.uri : undefined;
  } catch {
    return undefined;
  }
};

export const resolveEventImageSource = (image?: string): ImageSourcePropType | { uri: string } | undefined => {
  if (!image) return undefined;
  const localAsset = EVENT_IMAGE_ASSETS[image];
  if (localAsset) return localAsset;
  return { uri: image };
};

export const getTourBrandAsset = (eventId?: string | null): TourBrandAsset | null => {
  if (!eventId) return null;
  return TOUR_BRAND_ASSETS[eventId] || null;
};

export const getLampBrandConfig = (eventId?: string | null): LampBrandConfig | null => {
  const brand = getTourBrandAsset(eventId);
  if (!brand) return null;

  const uri = resolveUri(brand.logo);
  return {
    logoSrcDark: uri,
    logoSrcLight: uri,
    logoFallbackSrc: uri,
    logoAlt: brand.label,
  };
};

export const isTourBrandEvent = (eventId?: string | null): boolean => {
  return Boolean(eventId && TOUR_BRAND_ASSETS[eventId]);
};

export const HASHPASS_BRAND_LOGOS = {
  dark: HASHPASS_DARK_LOGO,
  light: HASHPASS_LIGHT_LOGO,
  plain: BSL_PLAIN_LOGO,
};
