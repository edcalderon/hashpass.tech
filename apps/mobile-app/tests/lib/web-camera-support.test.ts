/// <reference types="jest" />

import { Platform } from 'react-native';
import {
  detectWebBrowser,
  getWebCameraCapabilities,
  probeWebVideoInputs,
  subscribeToWebCameraSignals,
} from '../../lib/web-camera-support';

describe('detectWebBrowser', () => {
  it.each([
    ['firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 'firefox', 'Firefox', false],
    ['firefox android', 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0', 'firefox', 'Firefox', true],
    ['firefox ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15', 'firefox-ios', 'Firefox for iOS', true],
    ['chrome ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/605.1.15', 'chrome-ios', 'Chrome for iOS', true],
    ['chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'chrome', 'Chrome', false],
    ['edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0', 'edge', 'Edge', false],
    ['samsung internet', 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'samsung', 'Samsung Internet', true],
    ['safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 'safari', 'Safari', false],
    ['unknown', 'SomeWeirdBot/1.0', 'other', 'your browser', false],
  ])('identifies %s', (_name, ua, id, label, isMobile) => {
    const browser = detectWebBrowser(ua as string);
    expect(browser.id).toBe(id);
    expect(browser.label).toBe(label);
    expect(browser.isMobile).toBe(isMobile);
    if (String(ua).includes('iphone')) expect(browser.isIOS).toBe(true);
  });
});

describe('web camera capabilities', () => {
  const mockWindow = { isSecureContext: true };

  beforeEach(() => {
    Platform.OS = 'web';
    Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWindow });
  });

  it('reports what the current runtime supports', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: { getUserMedia: jest.fn(), enumerateDevices: jest.fn() },
        permissions: { query: jest.fn() },
      },
    });

    expect(getWebCameraCapabilities()).toEqual({
      secureContext: true,
      hasGetUserMedia: true,
      hasPermissionsApi: true,
      hasEnumerateDevices: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: {} },
    });
    expect(getWebCameraCapabilities()).toEqual({
      secureContext: true,
      hasGetUserMedia: false,
      hasPermissionsApi: false,
      hasEnumerateDevices: false,
    });
  });

  it('reports nothing outside the web platform', () => {
    Platform.OS = 'android';
    expect(getWebCameraCapabilities()).toEqual({
      secureContext: false,
      hasGetUserMedia: false,
      hasPermissionsApi: false,
      hasEnumerateDevices: false,
    });
  });
});

describe('probeWebVideoInputs', () => {
  beforeEach(() => {
    Platform.OS = 'web';
  });

  const setNavigator = (mediaDevices: unknown) => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices } });
  };

  it('stays inconclusive when Firefox lists no devices before permission', async () => {
    setNavigator({ getUserMedia: jest.fn(), enumerateDevices: jest.fn().mockResolvedValue([]) });
    expect((await probeWebVideoInputs()).outcome).toBe('inconclusive');
  });

  it('stays inconclusive when enumeration is unsupported or fails', async () => {
    setNavigator({ getUserMedia: jest.fn() });
    expect((await probeWebVideoInputs()).outcome).toBe('inconclusive');
    setNavigator({ getUserMedia: jest.fn(), enumerateDevices: jest.fn().mockRejectedValue(new Error('blocked')) });
    expect((await probeWebVideoInputs()).outcome).toBe('inconclusive');
  });

  it('detects a machine with no camera and one with a camera', async () => {
    setNavigator({ getUserMedia: jest.fn(), enumerateDevices: jest.fn().mockResolvedValue([
      { kind: 'audioinput' }, { kind: 'audiooutput' },
    ]) });
    expect((await probeWebVideoInputs()).outcome).toBe('no-camera');

    setNavigator({ getUserMedia: jest.fn(), enumerateDevices: jest.fn().mockResolvedValue([
      { kind: 'videoinput' }, { kind: 'audioinput' },
    ]) });
    expect((await probeWebVideoInputs()).outcome).toBe('has-camera');
  });

  it('reports unavailable off the web platform', async () => {
    Platform.OS = 'ios';
    expect((await probeWebVideoInputs()).outcome).toBe('unavailable');
  });
});

describe('subscribeToWebCameraSignals', () => {
  const events: Record<string, Set<() => void>> = { change: new Set(), devicechange: new Set() };

  const fire = (event: string) => events[event].forEach((handler) => handler());

  beforeEach(() => {
    Platform.OS = 'web';
    events.change = new Set();
    events.devicechange = new Set();
    const eventTarget = {
      addEventListener: (event: string, handler: () => void) => events[event].add(handler),
      removeEventListener: (event: string, handler: () => void) => events[event].delete(handler),
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: { getUserMedia: jest.fn(), ...eventTarget },
        permissions: {
          query: jest.fn().mockResolvedValue({ state: 'prompt', ...eventTarget }),
        },
      },
    });
  });

  it('fires on permission changes and device changes, then unsubscribes', async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToWebCameraSignals((signal) => seen.push(signal.type));

    await Promise.resolve(); // the permissions query resolves asynchronously
    expect(events.change.size).toBeGreaterThan(0);

    fire('change');
    fire('devicechange');
    expect(seen.filter((type) => type === 'permission-changed').length).toBeGreaterThan(0);
    expect(seen).toContain('devices-changed');

    unsubscribe();
    fire('change');
    fire('devicechange');
    expect(seen).toHaveLength(2);
  });

  it('degrades to a no-op when the browser supports neither signal', () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {} } });
    const seen: string[] = [];
    const unsubscribe = subscribeToWebCameraSignals((signal) => seen.push(signal.type));
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
    expect(seen).toEqual([]);
  });
});
