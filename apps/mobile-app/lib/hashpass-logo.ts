import { Platform, type ImageSourcePropType } from "react-native";

const HASHPASS_DARK_LOGO_WEB = require("../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg");
const HASHPASS_DARK_LOGO_NATIVE = require("../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp");
const HASHPASS_LIGHT_LOGO_WEB = require("../assets/logos/hashpass/logo-full-hashpass-black.svg");
const HASHPASS_LIGHT_LOGO_NATIVE = require("../assets/logos/hashpass/logo-full-hashpass-black.webp");

// Footer-specific: on light web the footer has a dark-tinted gradient background,
// so use the white logo there instead of the black hero logo.
const HASHPASS_LIGHT_FOOTER_LOGO_WEB = require("../assets/logos/hashpass/logo-full-hashpass-white.svg");

export const getHashpassFullLogo = (isDark: boolean): ImageSourcePropType => {
  if (Platform.OS === "web") {
    return isDark ? HASHPASS_DARK_LOGO_WEB : HASHPASS_LIGHT_LOGO_WEB;
  }

  return isDark ? HASHPASS_DARK_LOGO_NATIVE : HASHPASS_LIGHT_LOGO_NATIVE;
};

export const getHashpassFooterLogo = (isDark: boolean): ImageSourcePropType => {
  if (Platform.OS === "web") {
    // Footer always sits on a dark-tinted background regardless of theme.
    return isDark ? HASHPASS_DARK_LOGO_WEB : HASHPASS_LIGHT_FOOTER_LOGO_WEB;
  }

  return isDark ? HASHPASS_DARK_LOGO_NATIVE : HASHPASS_LIGHT_LOGO_NATIVE;
};

export const getHashpassStaticHeroLogo = (
  isDark: boolean,
): ImageSourcePropType => {
  // Unlike the footer, the static hero sits on the page's own background
  // (#FFFFFF in light mode, see home.tsx's animatedBackground) -- not a
  // dark-tinted backdrop -- so light mode needs the black logo for
  // contrast, same as getHashpassFullLogo. Previously copied the footer's
  // white variant here, which rendered invisible (white-on-white).
  if (Platform.OS === "web") {
    return isDark ? HASHPASS_DARK_LOGO_WEB : HASHPASS_LIGHT_LOGO_WEB;
  }

  return isDark ? HASHPASS_DARK_LOGO_NATIVE : HASHPASS_LIGHT_LOGO_NATIVE;
};
