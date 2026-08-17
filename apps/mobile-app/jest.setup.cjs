jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: {
    alert: jest.fn(),
  },
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  AccessibilityInfo: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
  },
  Appearance: {
    getColorScheme: () => 'light',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn(),
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
  Dimensions: {
    get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  FlatList: 'FlatList',
  Image: 'Image',
  ImageBackground: 'ImageBackground',
  Modal: 'Modal',
  Linking: {
    openURL: jest.fn(),
  },
  Platform: {
    OS: 'web',
    select: (options) => options.web ?? options.default,
  },
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  SafeAreaView: 'SafeAreaView',
  ScrollView: 'ScrollView',
  StatusBar: 'StatusBar',
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
  },
  Switch: 'Switch',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  UIManager: {
    getViewManagerConfig: () => undefined,
  },
  View: 'View',
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));

jest.mock(
  'react-native-css-interop/src/runtime/native/appearance-observables',
  () => ({
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);

// Reanimated's real entry point needs native module bindings that don't
// exist under jest -- useSharedValue etc. throw "is not a function" without
// mocking it. react-native-reanimated/mock.js (the package's own documented
// jest mock) was tried first, but in this installed version (~3.17.4) it
// still requires Animated.ts -> createAnimatedComponent -> the real
// NativeReanimatedModule, which throws the same way. This is a self-contained
// replacement covering only the APIs actually imported anywhere in this repo
// (see the `grep -rhoE "from ['"]react-native-reanimated['"]"` used to build
// this list) -- add to it if a new export is imported and this mock doesn't
// have it yet.
jest.mock('react-native-reanimated', () => {
  const React = require('react');

  const makeSharedValue = (initial) => ({ value: initial });

  const runAnimation = (toValue, config, callback) => {
    const value =
      config && typeof config === 'object' && 'value' in config
        ? config.value
        : toValue;
    if (typeof callback === 'function') callback(true);
    return value;
  };

  const identityEasing = (t) => t;
  const Easing = {
    linear: identityEasing,
    ease: identityEasing,
    quad: identityEasing,
    cubic: identityEasing,
    bezier: () => identityEasing,
    in: (fn) => fn,
    out: (fn) => fn,
    inOut: (fn) => fn,
  };

  const chainableEntranceExit = () => {
    const stub = {
      duration: () => stub,
      delay: () => stub,
      springify: () => stub,
      damping: () => stub,
      easing: () => stub,
      build: () => undefined,
    };
    return stub;
  };

  const interpolate = (value, inputRange, outputRange) => {
    if (outputRange.length === 0) return value;
    if (value <= inputRange[0]) return outputRange[0];
    if (value >= inputRange[inputRange.length - 1])
      return outputRange[outputRange.length - 1];
    for (let i = 1; i < inputRange.length; i += 1) {
      if (value <= inputRange[i]) {
        const inStart = inputRange[i - 1];
        const inEnd = inputRange[i];
        const outStart = outputRange[i - 1];
        const outEnd = outputRange[i];
        const ratio = (value - inStart) / (inEnd - inStart || 1);
        return outStart + ratio * (outEnd - outStart);
      }
    }
    return outputRange[outputRange.length - 1];
  };

  const makeAnimatedComponent = (tagName) =>
    React.forwardRef((props, ref) =>
      React.createElement(tagName, { ...props, ref }),
    );

  return {
    __esModule: true,
    default: {
      View: makeAnimatedComponent('Animated.View'),
      Text: makeAnimatedComponent('Animated.Text'),
      Image: makeAnimatedComponent('Animated.Image'),
      ScrollView: makeAnimatedComponent('Animated.ScrollView'),
      FlatList: makeAnimatedComponent('Animated.FlatList'),
      createAnimatedComponent: (Component) =>
        React.forwardRef((props, ref) =>
          React.createElement(Component, { ...props, ref }),
        ),
    },
    useSharedValue: makeSharedValue,
    useAnimatedStyle: (styleFactory) => styleFactory(),
    useAnimatedProps: (propsFactory) => propsFactory(),
    useAnimatedReaction: () => {},
    useDerivedValue: (factory) => makeSharedValue(factory()),
    withTiming: runAnimation,
    withSpring: runAnimation,
    withDelay: (_delayMs, animation) => animation,
    withRepeat: (animation) => animation,
    cancelAnimation: () => {},
    runOnJS:
      (fn) =>
      (...args) =>
        fn(...args),
    runOnUI:
      (fn) =>
      (...args) =>
        fn(...args),
    interpolate,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing,
    FadeIn: chainableEntranceExit(),
    FadeOut: chainableEntranceExit(),
    FadeInDown: chainableEntranceExit(),
    FadeInUp: chainableEntranceExit(),
  };
});
