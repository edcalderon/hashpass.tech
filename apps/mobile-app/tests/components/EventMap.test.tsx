/// <reference types="jest" />

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking, Platform } from 'react-native';
import EventMap from '../../components/EventMap';

const mockGeocode = jest.fn();
const mockBuildMapHtml = jest.fn(({ label }: { label: string }) => `<html>${label}</html>`);
const mockOpenStreetMapUrl = jest.fn(({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`,
);
const mockOpenStreetMapSearchUrl = jest.fn((query: string) =>
  `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`,
);

jest.mock('../../lib/event-map', () => ({
  buildMapHtml: (...args: [{ label: string }]) => mockBuildMapHtml(...args),
  geocode: (...args: [unknown, AbortSignal]) => mockGeocode(...args),
  isEventMapNavigationAllowed: (rawUrl: string) => {
    if (rawUrl.startsWith('about:')) return true;
    try {
      return new URL(rawUrl).origin === 'https://hashpass.tech';
    } catch {
      return false;
    }
  },
  openStreetMapUrl: (...args: [{ lat: number; lng: number; zoom: number }]) => mockOpenStreetMapUrl(...args),
  openStreetMapSearchUrl: (...args: [string]) => mockOpenStreetMapSearchUrl(...args),
}));

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('lucide-react-native', () => ({
  ExternalLink: 'ExternalLink',
  MapPin: 'MapPin',
}));

describe('EventMap', () => {
  const originalPlatform = Platform.OS;
  let renderer!: ReactTestRenderer;

  beforeEach(() => {
    Platform.OS = 'web';
    mockGeocode.mockReset();
    mockBuildMapHtml.mockClear();
    mockOpenStreetMapUrl.mockClear();
    mockOpenStreetMapSearchUrl.mockClear();
    jest.mocked(Linking.openURL).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    Platform.OS = originalPlatform;
  });

  const render = async (geocodeResult: unknown, reject = false) => {
    if (reject) mockGeocode.mockRejectedValueOnce(geocodeResult);
    else mockGeocode.mockResolvedValueOnce(geocodeResult);
    await act(async () => {
      renderer = create(
        <EventMap
          address="Cra 40 #22C-67, Bogotá"
          venue="Corferias"
          city="Bogotá"
          country="Colombia"
          label="Corferias"
          isDark={false}
          animated
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('shows the loading state before geocoding resolves', () => {
    mockGeocode.mockReturnValue(new Promise(() => undefined));
    act(() => {
      renderer = create(
        <EventMap label="Corferias" city="Bogotá" country="Colombia" isDark={false} animated />,
      );
    });

    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);
    expect(renderer.root.findByProps({ testID: 'event-info-map' })).toBeTruthy();
  });

  it('renders the web map, fades it in after load, and opens its pinned location', async () => {
    await render({ lat: 4.63, lng: -74.09, zoom: 16 });

    const iframe = renderer.root.findByType('iframe' as any);
    expect(iframe.props.title).toBe('Map of Corferias');
    expect(iframe.props.srcDoc).toContain('Corferias');
    expect(iframe.props.sandbox).toBe('allow-scripts');
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);

    act(() => iframe.props.onLoad());
    expect(renderer.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);

    const link = renderer.root.findByProps({ accessibilityLabel: 'Open Corferias in OpenStreetMap' });
    act(() => link.props.onPress());
    expect(mockOpenStreetMapUrl).toHaveBeenCalledWith({ lat: 4.63, lng: -74.09, zoom: 16 });
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.openstreetmap.org/?mlat=4.63&mlon=-74.09#map=16/4.63/-74.09',
    );
  });

  it('shows the unavailable placeholder and a search link after a geocoding failure', async () => {
    await render(new Error('Nominatim unavailable'), true);

    expect(renderer.root.findByType('MapPin' as any)).toBeTruthy();
    expect(renderer.root.findAllByProps({ children: "We couldn't locate this venue on the map." })).toHaveLength(1);
    const link = renderer.root.findByProps({ accessibilityLabel: 'Open Corferias in OpenStreetMap' });
    act(() => link.props.onPress());
    expect(mockOpenStreetMapSearchUrl).toHaveBeenCalledWith('Cra 40 #22C-67, Bogotá, Corferias, Bogotá, Colombia');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.openstreetmap.org/search?query=Cra%2040%20%2322C-67%2C%20Bogot%C3%A1%2C%20Corferias%2C%20Bogot%C3%A1%2C%20Colombia',
    );
  });

  it('keeps same-origin native map navigation internal and external links outside', async () => {
    Platform.OS = 'android';
    await render({ lat: 4.63, lng: -74.09, zoom: 16 });

    const webView = renderer.root.findByType('WebView' as any);
    expect(webView.props.source.baseUrl).toBe('https://hashpass.tech');
    expect(webView.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
    expect(webView.props.onShouldStartLoadWithRequest({ url: 'https://hashpass.tech/attribution' })).toBe(true);
    expect(webView.props.onShouldStartLoadWithRequest({ url: 'https://hashpass.tech.evil.example' })).toBe(false);
    expect(Linking.openURL).toHaveBeenCalledWith('https://hashpass.tech.evil.example');
  });
});
