/// <reference types="jest" />

describe('native event registry patch', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('registers stock Android scroll direct events when missing', () => {
    const customDirectEventTypes = {};

    jest.doMock(
      'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry',
      () => ({ customDirectEventTypes }),
      { virtual: true },
    );

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    const result = installNativeEventRegistryPatch();

    expect(result.installed).toBe(true);
    expect(customDirectEventTypes.topScroll).toEqual({
      registrationName: 'onScroll',
    });
    expect(customDirectEventTypes.topMomentumScrollEnd).toEqual({
      registrationName: 'onMomentumScrollEnd',
    });
    expect(result.patched).toEqual(
      expect.arrayContaining(['topScroll', 'topScrollEndDrag']),
    );
  });

  it('preserves existing native event registrations', () => {
    const existingTopScroll = { registrationName: 'customOnScroll' };
    const customDirectEventTypes = {
      topScroll: existingTopScroll,
    };

    jest.doMock(
      'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry',
      () => ({ customDirectEventTypes }),
      { virtual: true },
    );

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    const result = installNativeEventRegistryPatch();

    expect(result.installed).toBe(true);
    expect(customDirectEventTypes.topScroll).toBe(existingTopScroll);
    expect(result.patched).not.toContain('topScroll');
  });
});
