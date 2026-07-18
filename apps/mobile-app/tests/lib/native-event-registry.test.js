/// <reference types="jest" />

describe('native event registry patch', () => {
  const originalErrorUtils = global.ErrorUtils;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    if (originalErrorUtils === undefined) {
      delete global.ErrorUtils;
    } else {
      global.ErrorUtils = originalErrorUtils;
    }
  });

  const mockRegistry = (customDirectEventTypes) => {
    jest.doMock(
      'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry',
      () => ({ customDirectEventTypes }),
      { virtual: true },
    );
  };

  const mockErrorUtils = () => {
    const previousHandler = jest.fn();
    let currentHandler = previousHandler;
    global.ErrorUtils = {
      getGlobalHandler: () => currentHandler,
      setGlobalHandler: (handler) => {
        currentHandler = handler;
      },
    };
    return {
      previousHandler,
      invoke: (error, isFatal) => currentHandler(error, isFatal),
    };
  };

  it('registers stock Android scroll direct events when missing', () => {
    const customDirectEventTypes = {};
    mockRegistry(customDirectEventTypes);

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

  it('registers react-native-screens transition events when missing', () => {
    const customDirectEventTypes = {};
    mockRegistry(customDirectEventTypes);

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    const result = installNativeEventRegistryPatch();

    expect(result.installed).toBe(true);
    expect(customDirectEventTypes.topDetached).toEqual({
      registrationName: 'onDetached',
    });
    expect(customDirectEventTypes.topAttached).toEqual({
      registrationName: 'onAttached',
    });
    expect(customDirectEventTypes.topAppear).toEqual({
      registrationName: 'onAppear',
    });
    expect(customDirectEventTypes.topDismissed).toEqual({
      registrationName: 'onDismissed',
    });
    expect(customDirectEventTypes.topTransitionProgress).toEqual({
      registrationName: 'onTransitionProgress',
    });
    expect(customDirectEventTypes.topInsetsChange).toEqual({
      registrationName: 'onInsetsChange',
    });
    expect(result.patched).toEqual(
      expect.arrayContaining(['topDetached', 'topAttached', 'topWillDisappear']),
    );
  });

  it('preserves existing native event registrations', () => {
    const existingTopScroll = { registrationName: 'customOnScroll' };
    const existingTopLayout = { registrationName: 'customOnLayout' };
    const customDirectEventTypes = {
      topLayout: existingTopLayout,
      topScroll: existingTopScroll,
    };
    mockRegistry(customDirectEventTypes);

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    const result = installNativeEventRegistryPatch();

    expect(result.installed).toBe(true);
    expect(customDirectEventTypes.topScroll).toBe(existingTopScroll);
    expect(customDirectEventTypes.topLayout).toBe(existingTopLayout);
    expect(result.patched).not.toContain('topScroll');
    expect(result.patched).not.toContain('topLayout');
  });

  it('swallows unsupported-top-level-event fatals and registers the event', () => {
    const customDirectEventTypes = {};
    mockRegistry(customDirectEventTypes);
    const { previousHandler, invoke } = mockErrorUtils();

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    const result = installNativeEventRegistryPatch();

    expect(result.crashGuardInstalled).toBe(true);

    const error = new Error(
      'Unsupported top level event type "topSomethingNew" dispatched',
    );
    invoke(error, true);

    expect(previousHandler).not.toHaveBeenCalled();
    expect(customDirectEventTypes.topSomethingNew).toEqual({
      registrationName: 'onSomethingNew',
    });
  });

  it('forwards unrelated errors to the previous global handler', () => {
    mockRegistry({});
    const { previousHandler, invoke } = mockErrorUtils();

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    installNativeEventRegistryPatch();

    const error = new Error('Some other fatal error');
    invoke(error, true);

    expect(previousHandler).toHaveBeenCalledWith(error, true);
  });

  it('installs the crash guard even when the registry is unavailable', () => {
    jest.doMock(
      'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry',
      () => {
        throw new Error('registry unavailable');
      },
      { virtual: true },
    );
    const { previousHandler, invoke } = mockErrorUtils();

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    const result = installNativeEventRegistryPatch();

    expect(result.installed).toBe(false);
    expect(result.crashGuardInstalled).toBe(true);

    invoke(
      new Error('Unsupported top level event type "topDetached" dispatched'),
      true,
    );
    expect(previousHandler).not.toHaveBeenCalled();
  });

  it('regains control when re-installed after something else overwrote the handler', () => {
    // Reproduces the real 2026-07-18 crash: index.js installs the guard, then
    // require('expo-router/entry') pulls in React Native's own
    // setUpErrorHandling.js, which calls ErrorUtils.setGlobalHandler()
    // unconditionally — no chaining — silently discarding the guard. A
    // FATAL EXCEPTION on mqt_v_native (Unsupported top level event type
    // "topLayout"/"topAttached") reached native ReactHost.handleHostException
    // because of this; our guard's own "dropped unsupported event" log had
    // never fired despite "installed" firing on every launch.
    mockRegistry({});
    const { invoke } = mockErrorUtils();

    const { installNativeEventRegistryPatch } = require('../../lib/polyfills/native-event-registry');
    installNativeEventRegistryPatch();

    // Simulate RN core's unconditional, non-chaining overwrite.
    const rnCoreDefaultHandler = jest.fn();
    global.ErrorUtils.setGlobalHandler(rnCoreDefaultHandler);

    // Without a second install, the guard is orphaned: the fatal reaches
    // RN's own default handler, which is what crashes the app.
    const orphanedError = new Error('Unsupported top level event type "topLayout" dispatched');
    invoke(orphanedError, true);
    expect(rnCoreDefaultHandler).toHaveBeenCalledWith(orphanedError, true);

    // Re-install (this is what app/_layout.tsx now does after RN core and
    // Sentry have both already registered their own handlers) — the guard
    // must become the active handler again.
    rnCoreDefaultHandler.mockClear();
    installNativeEventRegistryPatch();

    const laterError = new Error('Unsupported top level event type "topAttached" dispatched');
    invoke(laterError, true);

    expect(rnCoreDefaultHandler).not.toHaveBeenCalled();
  });
});
