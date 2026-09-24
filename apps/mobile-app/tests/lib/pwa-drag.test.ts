/// <reference types="jest" />

import {
  clampPwaDragPosition,
  getDefaultPwaDragPosition,
  getPwaDragViewport,
  PWA_DRAG_BOTTOM_SAFE_MARGIN,
  PWA_DRAG_BUTTON_SIZE,
  PWA_DRAG_POSITION_KEY,
  PWA_DRAG_SAFE_MARGIN,
  readStoredPwaDragPosition,
  storePwaDragPosition,
} from '../../lib/pwa-drag';

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    clear: jest.fn(() => {
      store = {};
    }),
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
  };
})();

describe('PWA drag positioning', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });

  it('uses the visible visual viewport instead of the taller layout viewport', () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      value: { width: 390, height: 690 },
      configurable: true,
    });

    expect(getPwaDragViewport()).toEqual({ width: 390, height: 690, offsetLeft: 0, offsetTop: 0 });
  });

  it('falls back to a usable viewport size when visual viewport dimensions are unavailable', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: { width: 0, height: 0, offsetLeft: 12, offsetTop: 18 },
      configurable: true,
    });

    expect(getPwaDragViewport()).toEqual({ width: 390, height: 800, offsetLeft: 12, offsetTop: 18 });
  });

  it('keeps a freely dropped position inside a panned visual viewport', () => {
    const viewport = { width: 320, height: 240, offsetLeft: 18, offsetTop: 32 };

    expect(clampPwaDragPosition({ left: 999, top: 999 }, viewport)).toEqual({
      left: 256,
      top: 154,
    });
    expect(clampPwaDragPosition({ left: -999, top: -999 }, viewport)).toEqual({
      left: 30,
      top: 44,
    });
  });

  it('clamps the floating button inside the viewport', () => {
    const viewport = { width: 320, height: 240, offsetLeft: 0, offsetTop: 0 };

    expect(clampPwaDragPosition({ left: -100, top: -20 }, viewport)).toEqual({
      left: PWA_DRAG_SAFE_MARGIN,
      top: PWA_DRAG_SAFE_MARGIN,
    });

    expect(clampPwaDragPosition({ left: 400, top: 300 }, viewport)).toEqual({
      left: viewport.width - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN,
      top: viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_BOTTOM_SAFE_MARGIN,
    });
  });

  it('uses a safe bottom-left starting position without restricting later drops', () => {
    const viewport = { width: 320, height: 240, offsetLeft: 0, offsetTop: 0 };

    expect(getDefaultPwaDragPosition(viewport)).toEqual({
      left: PWA_DRAG_SAFE_MARGIN,
      top: viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_BOTTOM_SAFE_MARGIN,
    });
  });

  it('preserves an arbitrary dropped coordinate instead of snapping it to a dock', () => {
    const viewport = { width: 320, height: 240, offsetLeft: 0, offsetTop: 0 };

    expect(clampPwaDragPosition({ left: 142, top: 78 }, viewport)).toEqual({ left: 142, top: 78 });
  });

  it('migrates the legacy dock value into a free safe coordinate', () => {
    window.localStorage.setItem(PWA_DRAG_POSITION_KEY, '"bottom-right"');

    expect(readStoredPwaDragPosition()).toEqual({
      left: 308,
      top: 682,
    });
  });

  it('persists and reads the last dropped position', () => {
    storePwaDragPosition({ left: 144, top: 92 });

    expect(window.localStorage.getItem(PWA_DRAG_POSITION_KEY)).toBe('{"left":144,"top":92}');
    expect(readStoredPwaDragPosition()).toEqual({ left: 144, top: 92 });
  });

  it('ignores malformed stored positions', () => {
    window.localStorage.setItem(PWA_DRAG_POSITION_KEY, '{"left":"bad","top":92}');

    expect(readStoredPwaDragPosition()).toBeNull();
  });
});
