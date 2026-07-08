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
