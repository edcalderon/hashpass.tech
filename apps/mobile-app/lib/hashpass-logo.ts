import { type ImageSourcePropType } from "react-native";

// Keep these as bundled raster assets on web and native. Expo's local web
// server does not expose arbitrary `/assets/...` URLs, and SVG resolution can
// collapse to a directory request such as `/logos/hashpass`.
const HASHPASS_DARK_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp");
const HASHPASS_LIGHT_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-black.webp");

// Footer-specific: on light web the footer has a dark-tinted gradient background,
// so use the white logo there instead of the black hero logo.
const HASHPASS_LIGHT_FOOTER_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-white.webp");

export const getHashpassFullLogo = (isDark: boolean): ImageSourcePropType => {
  return isDark ? HASHPASS_DARK_LOGO : HASHPASS_LIGHT_LOGO;
};

export const getHashpassFooterLogo = (isDark: boolean): ImageSourcePropType => {
  // Footer always sits on a dark-tinted background regardless of theme.
  return isDark ? HASHPASS_DARK_LOGO : HASHPASS_LIGHT_FOOTER_LOGO;
};

export const getHashpassStaticHeroLogo = (
  isDark: boolean,
): ImageSourcePropType => {
  // Unlike the footer, the static hero sits on the page's own background
  // (#FFFFFF in light mode, see home.tsx's animatedBackground) -- not a
  // dark-tinted backdrop -- so light mode needs the black logo for
  // contrast, same as getHashpassFullLogo. Previously copied the footer's
  // white variant here, which rendered invisible (white-on-white).
  return isDark ? HASHPASS_DARK_LOGO : HASHPASS_LIGHT_LOGO;
};
