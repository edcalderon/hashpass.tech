/// <reference types="jest" />

import {
  clampPwaDragPosition,
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
  });

  it('clamps the floating button inside the viewport', () => {
    const viewport = { width: 320, height: 240 };

    expect(clampPwaDragPosition({ left: -100, top: -20 }, viewport)).toEqual({
      left: PWA_DRAG_SAFE_MARGIN,
      top: PWA_DRAG_SAFE_MARGIN,
    });

    expect(clampPwaDragPosition({ left: 400, top: 300 }, viewport)).toEqual({
      left: viewport.width - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN,
      top: viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN,
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
