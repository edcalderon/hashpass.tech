import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { buildNotchMaskDataUri } from '../../lib/pass-notch-path';
import type { NotchMaskGeometry } from '../../lib/pass-notch-path';

interface NotchMaskedCardProps {
  geometry: NotchMaskGeometry;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Web implementation. @react-native-masked-view/masked-view has no real web
 * support -- its web shim (js/MaskedView.web.js) renders only the mask
 * element and silently drops `children`, so using it directly here made
 * every card render as a blank white shape (confirmed in a real browser: the
 * "card" was just the mask's own white fill, no ticket content at all).
 *
 * CSS mask-image does real alpha compositing natively, so this reimplements
 * the same cutout with it directly rather than routing through the library
 * on this platform. Same SVG geometry as the native mask (lib/pass-notch-path),
 * so the two platforms produce visually identical notches.
 */
const NotchMaskedCard: React.FC<NotchMaskedCardProps> = ({ geometry, style, children }) => {
  const flattened = StyleSheet.flatten(style) as React.CSSProperties | undefined;
  const maskUri = `url("${buildNotchMaskDataUri(geometry)}")`;

  return (
    <div
      style={{
        ...flattened,
        WebkitMaskImage: maskUri,
        maskImage: maskUri,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    >
      {children}
    </div>
  );
};

export default NotchMaskedCard;
