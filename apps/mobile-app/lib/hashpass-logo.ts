import { Platform, type ImageSourcePropType } from 'react-native';

const HASHPASS_DARK_LOGO_WEB = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg');
const HASHPASS_DARK_LOGO_NATIVE = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.png');
// Web light mode uses the black SVG on the landing page, where the background is already dark.
const HASHPASS_LIGHT_LOGO_WEB = require('../assets/logos/hashpass/logo-full-hashpass-black.svg');
const HASHPASS_LIGHT_LOGO_NATIVE = require('../assets/logos/hashpass/logo-full-hashpass-white.png');
const HASHPASS_AUTH_LOGO_WEB = require('../assets/logos/hashpass/logo-full-hashpass-white.svg');

const isAuthWebRoute = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  return /(^|\/)auth(?:\/|$)/.test(window.location.pathname);
};

export const getHashpassFullLogo = (isDark: boolean): ImageSourcePropType => {
  if (Platform.OS === 'web') {
    if (isAuthWebRoute()) {
      return HASHPASS_AUTH_LOGO_WEB;
    }

    return isDark ? HASHPASS_DARK_LOGO_WEB : HASHPASS_LIGHT_LOGO_WEB;
  }

  return isDark ? HASHPASS_DARK_LOGO_NATIVE : HASHPASS_LIGHT_LOGO_NATIVE;
};
