/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Dimensions: { get: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Appearance: { getColorScheme: jest.fn(() => 'light'), addChangeListener: jest.fn(), addEventListener: jest.fn() },
  Linking: { canOpenURL: jest.fn(async () => true), openURL: jest.fn(async () => {}) },
  Modal: 'Modal',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));
jest.mock('react-native-css-interop/src/runtime/native/appearance-observables', () => ({
  addChangeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeChangeListener: jest.fn(),
  removeEventListener: jest.fn(),
  resetAppearanceListeners: jest.fn(),
}), { virtual: true });
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }), { virtual: true });
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

describe('EmailPreviewFrame.native', () => {
  it('shows a loading overlay until the WebView reports load end, then hides it', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EmailPreviewFrame = require('../../components/EmailPreviewFrame.native').default;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EmailPreviewFrame html="<p>hi</p>" />);
    });

    const webView = renderer.root.findByType('WebView' as any);
    expect(webView.props.source).toEqual({ html: '<p>hi</p>' });
    expect(webView.props.originWhitelist).toEqual(['*']);
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);

    act(() => {
      webView.props.onLoadEnd();
    });
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);

    act(() => {
      webView.props.onLoadStart();
    });
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);
  });

  it('defaults to a 480 height and accepts an override', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EmailPreviewFrame = require('../../components/EmailPreviewFrame.native').default;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EmailPreviewFrame html="<p>hi</p>" height={600} />);
    });
    const frame = renderer.root.findAllByType('View' as any)[0];
    expect(frame.props.style).toEqual([expect.objectContaining({ borderRadius: 12 }), { height: 600 }]);
  });
});

describe('EmailPreviewFrame.web', () => {
  it('renders a sandboxed iframe with the html as srcDoc and hides the overlay on load', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EmailPreviewFrame = require('../../components/EmailPreviewFrame.web').default;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EmailPreviewFrame html="<p>hi</p>" />);
    });

    const iframe = renderer.root.findByType('iframe' as any);
    expect(iframe.props.srcDoc).toBe('<p>hi</p>');
    expect(iframe.props.sandbox).toBe('');
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);

    act(() => {
      iframe.props.onLoad();
    });
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  });
});
