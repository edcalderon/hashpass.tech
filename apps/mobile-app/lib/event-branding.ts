import { Image, Platform, type ImageSourcePropType } from 'react-native';

// SVG can't be decoded by React Native's native Image view (Android/iOS have
// no SVG image decoder, unlike browsers) -- these must be rasterized (webp)
// for native to render them at all. Web renders fine either way. See
// apps/docs/docs/reference/mobile-app/ for the equivalent hashpass-logo
// PNG->WebP conversion this follows the same pattern as.
const BSL_ONTOUR_LOGO = require('../assets/logos/bsl/bsl-ontour-pro.webp');
const BSL_PERU_LOGO = require('../assets/logos/bsl/bsl-peru-pro.webp');
const BSL_CHILE_LOGO = require('../assets/logos/bsl/bsl-chile-pro.webp');
const BSL_COLOMBIA_LOGO = require('../assets/logos/bsl/bsl-colombia-pro.webp');
const BSL_ARCHIVE_LOGO = require('../assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.webp');
const BSL_ARCHIVE_BANNER = require('../assets/images/bsl2025-hero.webp');
const BSL_PLAIN_LOGO = require('../assets/logos/bsl/bsl-white.webp');
const HASHPASS_DARK_LOGO = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp');
const HASHPASS_LIGHT_LOGO = require('../assets/logos/hashpass/logo-full-hashpass-black.webp');
// "Select Event" card watermark, shared by every tenant (BSL and the main
// hashpass explorer) -- not tied to a specific event, so it isn't part of
// EVENT_IMAGE_ASSETS/TOUR_BRAND_ASSETS below. Theme-aware: dark theme uses
// the white-fill variant, light theme the black-fill one.
const PRESENTS_WATERMARK_DARK = require('../assets/logos/bsl/bsl-presents-pro-white.webp');
const PRESENTS_WATERMARK_LIGHT = require('../assets/logos/bsl/bsl-presents-pro-black.webp');

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
  '/assets/images/bsl2025-hero.svg': BSL_ARCHIVE_BANNER,
  '/assets/images/bsl2025-hero.jpg': BSL_ARCHIVE_BANNER,
  '/assets/logos/hashpass/logo-full-hashpass-white-cyan.svg': HASHPASS_DARK_LOGO,
  '/assets/logos/hashpass/logo-full-hashpass-black.svg': HASHPASS_LIGHT_LOGO,
  'https://blockchainsummit.la/wp-content/uploads/2025/09/bsl2025-banner.jpg': BSL_ARCHIVE_BANNER,
  'https://blockchainsummit.la/wp-content/uploads/2025/09/logo-bsl.svg': BSL_ARCHIVE_LOGO,
};

const BLOCKCHAIN_SUMMIT_IMAGE_PATTERN = /^https?:\/\/(?:www\.)?blockchainsummit\.la\//i;

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
  if (BLOCKCHAIN_SUMMIT_IMAGE_PATTERN.test(image)) {
    return BSL_ARCHIVE_BANNER;
  }
  return { uri: image };
};

export const getTourBrandAsset = (eventId?: string | null): TourBrandAsset | null => {
  if (!eventId) return null;
  const brand = TOUR_BRAND_ASSETS[eventId];
  if (!brand) return null;
  return brand;
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

// Shared "Select Event" card watermark background, same asset for every
// tenant/event -- replaces each event's own distinct logo for this specific
// card's background image (the per-event logo still shows via the small
// colored badge elsewhere on the card).
export const getSelectEventCardWatermark = (isDark: boolean): ImageSourcePropType =>
  isDark ? PRESENTS_WATERMARK_DARK : PRESENTS_WATERMARK_LIGHT;
