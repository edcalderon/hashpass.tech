import React from 'react';
import { Platform, UIManager, View, type ViewProps } from 'react-native';
import { LinearGradient as ExpoLinearGradient, type LinearGradientProps } from 'expo-linear-gradient';

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

const SafeLinearGradient: React.FC<LinearGradientProps> = (props) => {
  if (hasNativeLinearGradient()) {
    return <ExpoLinearGradient {...props} />;
  }

  const {
    colors,
    locations: _locations,
    start: _start,
    end: _end,
    dither: _dither,
    useAngle: _useAngle,
    angle: _angle,
    angleCenter: _angleCenter,
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
