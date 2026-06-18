/// <reference types="jest" />

import React from 'react';
import TestimonialsColumn from '../../components/TestimonialsColumns';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Appearance: {
    getColorScheme: () => 'light',
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
    jest.spyOn(React, 'useState').mockImplementation((initial) => [initial, jest.fn()]);
    jest.spyOn(React, 'useEffect').mockImplementation(() => undefined);
    jest.spyOn(React, 'useMemo').mockImplementation((factory) => factory());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders avatars without relying on out-of-scope styles', () => {
    expect(() =>
      TestimonialsColumn({
        testimonials: [
          {
            text: 'HashPass keeps the event flow smooth.',
            wallet: '0x1234567890abcdef1234567890abcdef12345678',
            role: 'Organizer',
          },
        ],
      }),
    ).not.toThrow();
  });
});
