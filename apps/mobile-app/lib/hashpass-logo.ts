import { Platform, type ImageSourcePropType } from 'react-native';

const HASHPASS_DARK_LOGO_WEB = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg');
const HASHPASS_DARK_LOGO_NATIVE = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.png');
const HASHPASS_LIGHT_LOGO_WEB = require('../assets/logos/hashpass/logo-full-hashpass-white.svg');
const HASHPASS_LIGHT_LOGO_NATIVE = require('../assets/logos/hashpass/logo-full-hashpass-white.png');

export const getHashpassFullLogo = (isDark: boolean): ImageSourcePropType => {
  if (Platform.OS === 'web') {
    return isDark ? HASHPASS_DARK_LOGO_WEB : HASHPASS_LIGHT_LOGO_WEB;
  }

  return isDark ? HASHPASS_DARK_LOGO_NATIVE : HASHPASS_LIGHT_LOGO_NATIVE;
};
