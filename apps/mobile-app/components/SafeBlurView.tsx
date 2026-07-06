import React from 'react';
import { Platform, UIManager, View, type ViewProps } from 'react-native';
import type { BlurViewProps } from 'expo-blur';

type ExpoBlurViewComponent = React.ComponentType<BlurViewProps>;
type SafeBlurViewProps = BlurViewProps &
  ViewProps & {
    reducedTransparencyFallbackColor?: string;
  };

let cachedExpoBlurView: ExpoBlurViewComponent | null | undefined;

const hasNativeBlurView = (): boolean => {
  if (Platform.OS === 'web') {
    return false;
  }

  const getViewManagerConfig = UIManager.getViewManagerConfig?.bind(UIManager);
  if (typeof getViewManagerConfig !== 'function') {
    return false;
  }

  return Boolean(getViewManagerConfig('ExpoBlurView'));
};

const getExpoBlurView = (): ExpoBlurViewComponent | null => {
  if (cachedExpoBlurView !== undefined) {
    return cachedExpoBlurView;
  }

  try {
    const expoBlur = require('expo-blur') as {
      BlurView?: ExpoBlurViewComponent;
      default?: ExpoBlurViewComponent;
    };

    cachedExpoBlurView = expoBlur.BlurView || expoBlur.default || null;
  } catch {
    cachedExpoBlurView = null;
  }

  return cachedExpoBlurView;
};

const SafeBlurView: React.FC<BlurViewProps> = (props) => {
  if (Platform.OS === 'android') {
    const {
      intensity: _intensity,
      tint: _tint,
      experimentalBlurMethod: _experimentalBlurMethod,
      reducedTransparencyFallbackColor: fallbackColor,
      style,
      children,
      ...viewProps
    } = props as SafeBlurViewProps;

    return (
      <View {...viewProps} style={[style, fallbackColor ? { backgroundColor: fallbackColor } : null]}>
        {children}
      </View>
    );
  }

  const ExpoBlurView = hasNativeBlurView() ? getExpoBlurView() : null;

  if (ExpoBlurView) {
    return <ExpoBlurView {...props} />;
  }

  const {
    intensity: _intensity,
    tint: _tint,
    experimentalBlurMethod: _experimentalBlurMethod,
    reducedTransparencyFallbackColor: fallbackColor,
    style,
    children,
    ...viewProps
  } = props as SafeBlurViewProps;

  return (
    <View {...viewProps} style={[style, fallbackColor ? { backgroundColor: fallbackColor } : null]}>
      {children}
    </View>
  );
};

export default SafeBlurView;
