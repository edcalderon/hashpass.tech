import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import PassNotchMask from './PassNotchMask';
import type { NotchMaskGeometry } from '../../lib/pass-notch-path';

interface NotchMaskedCardProps {
  geometry: NotchMaskGeometry;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Native implementation: @react-native-masked-view/masked-view does real
 * alpha compositing here, so PassNotchMask's SVG cutout genuinely reveals
 * whatever's behind the card. See NotchMaskedCard.web.tsx for why web needs a
 * completely different implementation rather than sharing this one.
 */
const NotchMaskedCard: React.FC<NotchMaskedCardProps> = ({ geometry, style, children }) => (
  <MaskedView style={style} maskElement={<PassNotchMask {...geometry} />}>
    <View style={{ width: '100%', height: '100%' }}>{children}</View>
  </MaskedView>
);

export default NotchMaskedCard;
