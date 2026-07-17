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
    expect(customDirectEventTypes.topLayout).toEqual({
      registrationName: 'onLayout',
    });
    expect(result.patched).toEqual(
      expect.arrayContaining(['topScroll', 'topScrollEndDrag', 'topLayout']),
    );
  });

  it('preserves existing native event registrations', () => {
    const existingTopScroll = { registrationName: 'customOnScroll' };
    const existingTopLayout = { registrationName: 'customOnLayout' };
    const customDirectEventTypes = {
      topLayout: existingTopLayout,
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
    expect(customDirectEventTypes.topLayout).toBe(existingTopLayout);
    expect(result.patched).not.toContain('topScroll');
    expect(result.patched).not.toContain('topLayout');
  });
});
