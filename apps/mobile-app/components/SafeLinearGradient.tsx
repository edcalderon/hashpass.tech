import React from 'react';
import { Platform, UIManager, View, type ViewProps } from 'react-native';
import type { LinearGradientProps } from 'expo-linear-gradient';

type ExpoLinearGradientComponent = React.ComponentType<LinearGradientProps>;

let cachedExpoLinearGradient: ExpoLinearGradientComponent | null | undefined;

const hasNativeLinearGradient = (): boolean => {
  if (Platform.OS === 'web') {
    return true;
  }

  const getViewManagerConfig = UIManager.getViewManagerConfig?.bind(UIManager);
  if (typeof getViewManagerConfig !== 'function') {
    return false;
  }

  return Boolean(getViewManagerConfig('ExpoLinearGradient'));
};

const getExpoLinearGradient = (): ExpoLinearGradientComponent | null => {
  if (cachedExpoLinearGradient !== undefined) {
    return cachedExpoLinearGradient;
  }

  try {
    const expoLinearGradient = require('expo-linear-gradient') as {
      LinearGradient?: ExpoLinearGradientComponent;
      default?: ExpoLinearGradientComponent;
    };

    cachedExpoLinearGradient = expoLinearGradient.LinearGradient || expoLinearGradient.default || null;
  } catch {
    cachedExpoLinearGradient = null;
  }

  return cachedExpoLinearGradient;
};

const SafeLinearGradient: React.FC<LinearGradientProps> = (props) => {
  const ExpoLinearGradient = hasNativeLinearGradient() ? getExpoLinearGradient() : null;

  if (ExpoLinearGradient) {
    return <ExpoLinearGradient {...props} />;
  }

  const {
    colors,
    locations: _locations,
    start: _start,
    end: _end,
    dither: _dither,
    style,
    children,
    ...viewProps
  } = props as LinearGradientProps & ViewProps;

  const fallbackColor = Array.isArray(colors) && colors.length > 0 ? colors[0] : 'transparent';

  return (
    <View {...viewProps} style={[style, { backgroundColor: fallbackColor }]}>
      {children}
    </View>
  );
};

export default SafeLinearGradient;
