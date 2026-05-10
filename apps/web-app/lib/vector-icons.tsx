import React from 'react';
import { Platform } from 'react-native';
import {
  Ionicons as NativeIonicons,
  MaterialIcons as NativeMaterialIcons,
} from '../node_modules/@expo/vector-icons';

type IconProps = Omit<React.ComponentProps<typeof NativeMaterialIcons>, 'name'> & {
  name: string;
};

// Keep web rendering on MaterialIcons so Ionicons does not fetch its TTF asset.
const WEB_IONICONS_TO_MATERIAL_ICONS: Record<string, string> = {
  'alert-circle': 'error-outline',
  'arrow-back': 'arrow-back',
  'arrow-up': 'arrow-upward',
  'book-outline': 'book',
  'calendar-outline': 'calendar-today',
  'call-outline': 'call',
  'camera-outline': 'camera-alt',
  'checkmark-circle': 'check-circle',
  'chevron-down': 'keyboard-arrow-down',
  'chevron-forward': 'chevron-right',
  close: 'close',
  'close-circle': 'cancel',
  'cloud-download-outline': 'cloud-download',
  'information-circle-outline': 'info-outline',
  'keypad-outline': 'dialpad',
  'link-outline': 'link',
  'log-in': 'login',
  'log-out-outline': 'logout',
  'logo-apple': 'apple',
  'logo-google': 'language',
  'logo-google-playstore': 'play-circle-outline',
  'mail-open-outline': 'drafts',
  'mail-outline': 'email',
  menu: 'menu',
  'person-outline': 'person',
  'qr-code-outline': 'qr-code',
  refresh: 'refresh',
  'search-outline': 'search',
  'shield-outline': 'security',
  star: 'star',
  'ticket-outline': 'confirmation-number',
  'warning-outline': 'warning',
};

function WebIonicons({ name, ...props }: IconProps) {
  const mappedName = WEB_IONICONS_TO_MATERIAL_ICONS[name] ?? 'help-outline';
  return <NativeMaterialIcons {...props} name={mappedName as any} />;
}

export const Ionicons = Platform.OS === 'web' ? WebIonicons : NativeIonicons;
export const MaterialIcons = NativeMaterialIcons;
