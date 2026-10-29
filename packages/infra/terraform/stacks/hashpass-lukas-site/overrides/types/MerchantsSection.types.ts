import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type MerchantCategory = {
  title: string;
  subtitle: string;
  glyph: 'event' | 'coffee' | 'wallet' | 'market';
};

export type MerchantCategoryCardProps = {
  category: MerchantCategory;
  opacity: SharedValue<number>;
  translateY: SharedValue<number>;
  styles: {
    card: StyleProp<ViewStyle>;
    cardIconContainer: StyleProp<ViewStyle>;
    cardTitle: StyleProp<TextStyle>;
    cardSubtitle: StyleProp<TextStyle>;
  };
};
