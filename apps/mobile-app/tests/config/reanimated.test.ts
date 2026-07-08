/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

const setGlobalValue = (name: 'window' | 'document', value: unknown) => {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
};

const restoreGlobalValue = (
  name: 'window' | 'document',
  descriptor: PropertyDescriptor | undefined
) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  delete (globalThis as Record<string, unknown>)[name];
};

describe('config/reanimated', () => {
  const enableLayoutAnimations = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('react-native-reanimated', () => ({
      enableLayoutAnimations,
    }));
  });

  afterEach(() => {
    restoreGlobalValue('window', originalWindowDescriptor);
    restoreGlobalValue('document', originalDocumentDescriptor);
    jest.dontMock('react-native-reanimated');
  });

  it('does not enable Reanimated layout animations in browser web', () => {
    const testWindow = {};
    setGlobalValue('window', testWindow);
    setGlobalValue('document', {});

    require('../../config/reanimated');

    expect((testWindow as { _frameTimestamp?: unknown })._frameTimestamp).toBeNull();
    expect(enableLayoutAnimations).not.toHaveBeenCalled();
  });

  it('enables Reanimated layout animations only when no browser document exists', () => {
    const testWindow = {};
    setGlobalValue('window', testWindow);
    setGlobalValue('document', undefined);

    require('../../config/reanimated');

    expect((testWindow as { _frameTimestamp?: unknown })._frameTimestamp).toBeNull();
    expect(enableLayoutAnimations).toHaveBeenCalledWith(true);
  });

  it('does not load Reanimated during SSR', () => {
    setGlobalValue('window', undefined);

    require('../../config/reanimated');

    expect(enableLayoutAnimations).not.toHaveBeenCalled();
  });

  it('warns when Reanimated cannot be loaded at startup', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setGlobalValue('window', {});
    setGlobalValue('document', {});
    jest.doMock('react-native-reanimated', () => {
      throw new Error('module unavailable');
    });

    try {
      require('../../config/reanimated');

      expect(warnSpy).toHaveBeenCalledWith('react-native-reanimated not available, using polyfill');
      expect(enableLayoutAnimations).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
