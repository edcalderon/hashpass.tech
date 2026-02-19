/**
 * Polyfill for react-native-reanimated during SSR (Server-Side Rendering)
 * This ensures that Animated components are available even in Node.js context
 */

const React = require('react');
const { Animated: RNAnimated } = require('react-native');

// Create a mock Animated object that matches react-native-reanimated API
const createAnimatedComponent = (component) => {
  // In SSR, just return the component as-is
  return component;
};

// Mock the Animated API for SSR
const AnimatedMock = {
  ...RNAnimated,
  createAnimatedComponent,
  View: RNAnimated.View || React.forwardRef((props, ref) => React.createElement('div', { ...props, ref })),
  Text: RNAnimated.Text || React.forwardRef((props, ref) => React.createElement('span', { ...props, ref })),
  Image: RNAnimated.Image || React.forwardRef((props, ref) => React.createElement('img', { ...props, ref })),
  ScrollView: RNAnimated.ScrollView || React.forwardRef((props, ref) => React.createElement('div', { ...props, ref })),
};

// Mock react-native-reanimated exports
const reanimatedModule = {
  default: AnimatedMock,
  ...AnimatedMock,
  // Mock common hooks to return no-ops
  useAnimatedStyle: () => ({}),
  useSharedValue: (initial) => ({ value: initial }),
  useAnimatedScrollHandler: () => () => {},
  useAnimatedReaction: () => {},
  useAnimatedProps: () => ({}),
  withTiming: (value) => value,
  withSpring: (value) => value,
  withRepeat: (value) => value,
  withSequence: (...values) => values[0],
  withDelay: (delay, value) => value,
  interpolate: (value, inputRange, outputRange) => outputRange[0],
  Extrapolation: {
    IDENTITY: 'identity',
    CLAMP: 'clamp',
    EXTEND: 'extend',
  },
  Easing: {
    linear: () => 0,
    ease: () => 0,
    quad: () => 0,
    cubic: () => 0,
    poly: () => 0,
    sin: () => 0,
    circle: () => 0,
    exp: () => 0,
    elastic: () => 0,
    back: () => 0,
    bounce: () => 0,
    bezier: () => 0,
    in: () => 0,
    out: () => 0,
    inOut: () => 0,
  },
  enableLayoutAnimations: () => {},
  createAnimatedComponent,
};

module.exports = reanimatedModule;

