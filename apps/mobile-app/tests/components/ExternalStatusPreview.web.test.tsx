/// <reference types="jest" />

import React from 'react';

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
    const useThemePath = require.resolve('../../hooks/useTheme');
    const vectorIconsPath = require.resolve('../../lib/vector-icons');

    jest.doMock('react-native', () => ({
      ActivityIndicator: 'ActivityIndicator',
      Linking: {
        openURL: jest.fn(),
      },
      Appearance: {
        getColorScheme: () => 'light',
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

    jest.doMock(useThemePath, () => ({
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

    jest.doMock(vectorIconsPath, () => ({
      MaterialIcons: 'MaterialIcons',
    }));

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
