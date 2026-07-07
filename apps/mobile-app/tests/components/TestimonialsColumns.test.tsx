/// <reference types="jest" />

import React from 'react';

jest.mock('react-native', () => ({
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
  PixelRatio: {
    get: () => 1,
  },
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  View: 'View',
  Text: 'Text',
  Image: 'Image',
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
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: { paper: '#ffffff' },
      divider: '#e5e7eb',
      text: {
        primary: '#111111',
        secondary: '#4b5563',
      },
    },
    isDark: false,
  }),
}));

describe('TestimonialsColumn', () => {
  beforeEach(() => {
    jest.spyOn(React, 'useState').mockImplementation(((initial: unknown) => [initial, jest.fn()]) as any);
    jest.spyOn(React, 'useEffect').mockImplementation(() => undefined);
    jest.spyOn(React, 'useMemo').mockImplementation((factory) => factory());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders avatars without relying on out-of-scope styles', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const TestimonialsColumn = require('../../components/TestimonialsColumns').default;

    expect(() =>
      TestimonialsColumn({
        testimonials: [
          {
            text: 'HASHPASS keeps the event flow smooth.',
            wallet: '0x1234567890abcdef1234567890abcdef12345678',
            role: 'Organizer',
          },
        ],
      }),
    ).not.toThrow();
  });
});
