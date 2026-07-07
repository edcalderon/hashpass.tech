/// <reference types="jest" />

import React from 'react';

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
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
    get: jest.fn(() => ({ width: 1024, height: 768, scale: 1, fontScale: 1 })),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
  I18nManager: {
    isRTL: false,
  },
  Linking: {
    openURL: jest.fn(),
  },
  PixelRatio: {
    get: () => 1,
  },
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  Appearance: {
    getColorScheme: () => 'light',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn(),
  },
  StyleSheet: {
    create: (styles: any) => styles,
  },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#d93025',
      background: {
        paper: '#ffffff',
        default: '#f7f7f7',
      },
      divider: '#e5e7eb',
      text: {
        primary: '#111111',
        secondary: '#4b5563',
      },
    },
  }),
}));

jest.mock('../../lib/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

describe('ExternalStatusPreview.web', () => {
  let useStateSpy: jest.SpyInstance;

  beforeEach(() => {
    useStateSpy = jest.spyOn(React, 'useState');
    useStateSpy.mockImplementation((initial) => [initial, jest.fn()]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes the preview as expanded', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const ExternalStatusPreview = require('../../components/ExternalStatusPreview.web').default;

    expect(() =>
      ExternalStatusPreview({
        url: 'https://hashpass.status.cig.technology/',
      })
    ).not.toThrow();

    expect(useStateSpy).toHaveBeenNthCalledWith(1, true);
    expect(useStateSpy).toHaveBeenNthCalledWith(2, true);
  });
});
