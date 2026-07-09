/// <reference types="jest" />

jest.mock('react-native', () => {
  class MockAnimatedValue {
    value: number;

    constructor(value: number) {
      this.value = value;
    }

    stopAnimation = jest.fn();

    setValue = jest.fn((nextValue: number) => {
      this.value = nextValue;
    });

    interpolate = jest.fn(() => '0%');
  }

  const createAnimation = () => ({
    start: jest.fn(),
  });

  return {
    ActivityIndicator: 'ActivityIndicator',
    Alert: {
      alert: jest.fn(),
    },
    Animated: {
      Value: MockAnimatedValue,
      parallel: jest.fn(createAnimation),
      spring: jest.fn(createAnimation),
      timing: jest.fn(createAnimation),
      View: 'Animated.View',
    },
    Appearance: {
      addChangeListener: jest.fn(),
      addEventListener: jest.fn(),
      getColorScheme: () => 'light',
      removeChangeListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    AccessibilityInfo: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
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
    Linking: {
      openURL: jest.fn(),
    },
    Modal: 'Modal',
    Pressable: 'Pressable',
    Platform: {
      OS: 'web',
      select: (options: Record<string, unknown>) => options.web ?? options.default,
    },
    SafeAreaView: 'SafeAreaView',
    ScrollView: 'ScrollView',
    StatusBar: 'StatusBar',
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    Switch: 'Switch',
    Text: 'Text',
    TextInput: 'TextInput',
    TouchableOpacity: 'TouchableOpacity',
    UIManager: {
      getViewManagerConfig: () => undefined,
    },
    View: 'View',
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      success: { main: '#4CAF50' },
      error: { main: '#F44336' },
      warning: { main: '#FF9800' },
      primary: '#2196F3',
      divider: '#E0E0E0',
      text: { secondary: '#666666' },
    },
  }),
}));

jest.mock('../../lib/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

import React from 'react';
import TestRenderer from 'react-test-renderer';
import { ToastProvider, useToast } from '../../contexts/ToastContext';

describe('ToastContext', () => {
  it('appends a toast when showToast is called', () => {
    let showToast: ReturnType<typeof useToast>['showToast'] | null = null;

    const Harness = () => {
      showToast = useToast().showToast;
      return null;
    };

    let renderer: TestRenderer.ReactTestRenderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <ToastProvider>
          <Harness />
        </ToastProvider>
      );
    });

    expect(showToast).toBeTruthy();

    TestRenderer.act(() => {
      showToast?.({
        type: 'success',
        title: 'Saved',
        message: 'ToastContext coverage',
        duration: 0,
      });
    });

    expect(renderer!.root.findAllByType('MaterialIcons')).toHaveLength(2);
  });
});
