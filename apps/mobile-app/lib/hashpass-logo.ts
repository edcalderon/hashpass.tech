import { Platform, type ImageSourcePropType } from "react-native";

// Keep these as bundled raster assets on web and native. Expo's local web
// server does not expose arbitrary `/assets/...` URLs, and SVG resolution can
// collapse to a directory request such as `/logos/hashpass`.
// Do not infer foreground colour from the historical filenames. In
// particular, `logo-full-hashpass-black.svg` renders white letters with a red
// mark, while the similarly named WebP renders dark letters. These names say
// something about their source treatment, not their visible foreground.
const HASHPASS_WHITE_LETTER_RED_MARK_WEB = require("../assets/logos/hashpass/logo-full-hashpass-black.svg");
const HASHPASS_WHITE_LETTER_CYAN_MARK_RASTER = require("../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp");
const HASHPASS_DARK_LETTER_RED_MARK_RASTER = require("../assets/logos/hashpass/logo-full-hashpass-black.webp");

// Footer-specific: on light web the footer has a dark-tinted gradient background,
// so use the white logo there instead of the black hero logo.
const HASHPASS_WHITE_LETTER_FOOTER_RASTER = require("../assets/logos/hashpass/logo-full-hashpass-white.webp");

export const getHashpassFullLogo = (isDark: boolean): ImageSourcePropType => {
  return isDark
    ? HASHPASS_WHITE_LETTER_CYAN_MARK_RASTER
    : HASHPASS_DARK_LETTER_RED_MARK_RASTER;
};

export const getHashpassFooterLogo = (isDark: boolean): ImageSourcePropType => {
  // Footer always sits on a dark-tinted background regardless of theme.
  return isDark
    ? HASHPASS_WHITE_LETTER_CYAN_MARK_RASTER
    : HASHPASS_WHITE_LETTER_FOOTER_RASTER;
};

export const getHashpassStaticHeroLogo = (
  _isDark: boolean,
): ImageSourcePropType => {
  // The landing hero is dark in every theme. Web can render the exact,
  // verified SVG with white letters and the red mark; native Image cannot
  // decode SVG, so it receives the bundled white-letter raster fallback.
  return Platform.OS === "web"
    ? HASHPASS_WHITE_LETTER_RED_MARK_WEB
    : HASHPASS_WHITE_LETTER_CYAN_MARK_RASTER;
};
