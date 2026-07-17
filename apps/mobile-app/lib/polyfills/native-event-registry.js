'use strict';

const ANDROID_DIRECT_EVENTS = {
  // Stock direct events that can arrive before RN's generated view config
  // registry has registered them in Android release bundles.
  topLayout: {
    registrationName: 'onLayout',
  },
  topContentSizeChange: {
    registrationName: 'onContentSizeChange',
  },
  topMomentumScrollBegin: {
    registrationName: 'onMomentumScrollBegin',
  },
  topMomentumScrollEnd: {
    registrationName: 'onMomentumScrollEnd',
  },
  topScroll: {
    registrationName: 'onScroll',
  },
  topScrollBeginDrag: {
    registrationName: 'onScrollBeginDrag',
  },
  topScrollEndDrag: {
    registrationName: 'onScrollEndDrag',
  },
  // react-native-screens screen/header lifecycle events. The Kotlin event
  // names are patched to Fabric-style short names, but the C++/JNI event
  // pipeline still normalizes them back to `top*` before they reach the JS
  // event plugin (`event of type topDetached will be dropped` in logcat), so
  // the JS registry must know every one of them. `topDetached` was the fatal
  // on the v1.8.23x native auth -> dashboard transition.
  topAttached: {
    registrationName: 'onAttached',
  },
  topDetached: {
    registrationName: 'onDetached',
  },
  topAppear: {
    registrationName: 'onAppear',
  },
  topDisappear: {
    registrationName: 'onDisappear',
  },
  topWillAppear: {
    registrationName: 'onWillAppear',
  },
  topWillDisappear: {
    registrationName: 'onWillDisappear',
  },
  topDismissed: {
    registrationName: 'onDismissed',
  },
  topNativeDismissCancelled: {
    registrationName: 'onNativeDismissCancelled',
  },
  topHeaderHeightChange: {
    registrationName: 'onHeaderHeightChange',
  },
  topHeaderBackButtonClicked: {
    registrationName: 'onHeaderBackButtonClicked',
  },
  topTransitionProgress: {
    registrationName: 'onTransitionProgress',
  },
  topGestureCancel: {
    registrationName: 'onGestureCancel',
  },
  topSheetDetentChanged: {
    registrationName: 'onSheetDetentChanged',
  },
  topFinishTransitioning: {
    registrationName: 'onFinishTransitioning',
  },
  topSearchFocus: {
    registrationName: 'onSearchFocus',
  },
  topSearchBlur: {
    registrationName: 'onSearchBlur',
  },
  topSearchButtonPress: {
    registrationName: 'onSearchButtonPress',
  },
  topChangeText: {
    registrationName: 'onChangeText',
  },
  topOpen: {
    registrationName: 'onOpen',
  },
  topClose: {
    registrationName: 'onClose',
  },
  // react-native-safe-area-context (Paper name normalized the same way).
  topInsetsChange: {
    registrationName: 'onInsetsChange',
  },
};

const UNSUPPORTED_EVENT_MESSAGE_PATTERN =
  /Unsupported top level event type "([^"]+)" dispatched/;

// topFooBar -> onFooBar. Used for event names we did not anticipate.
function synthesizeDirectEventConfig(eventName) {
  return {
    registrationName: 'on' + eventName.slice(3),
  };
}

function isTopLevelEventName(eventName) {
  return (
    typeof eventName === 'string' &&
    eventName.length > 3 &&
    eventName.indexOf('top') === 0
  );
}

function loadDirectEventTypes() {
  let registry;

  try {
    registry = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');
  } catch (error) {
    console.warn('[HashPass][events] React Native view config registry unavailable', {
      message: error && error.message ? error.message : String(error),
    });
    return null;
  }

  const directEventTypes = registry && registry.customDirectEventTypes;

  if (!directEventTypes || typeof directEventTypes !== 'object') {
    console.warn('[HashPass][events] React Native direct event registry missing');
    return null;
  }

  return directEventTypes;
}

// Last line of defense: RN's event plugin throws
// `Unsupported top level event type "topX" dispatched` for any event name
// missing from the registry, and that throw is FATAL on Android — it killed
// the native auth -> dashboard transition (topDetached, and once topScroll
// even though it was registered at boot). Dropping a lifecycle event is
// always better than killing the app, so downgrade this exact error class to
// a logged warning and keep everything else on the normal fatal path.
function installUnsupportedEventCrashGuard(directEventTypes) {
  if (
    typeof ErrorUtils === 'undefined' ||
    !ErrorUtils ||
    typeof ErrorUtils.getGlobalHandler !== 'function' ||
    typeof ErrorUtils.setGlobalHandler !== 'function'
  ) {
    return false;
  }

  const previousHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler(function hashpassUnsupportedEventGuard(error, isFatal) {
    let message = '';
    try {
      message =
        error && typeof error.message === 'string' ? error.message : String(error);
    } catch (_) {
      message = '';
    }

    const match = message.match(UNSUPPORTED_EVENT_MESSAGE_PATTERN);

    if (match && isTopLevelEventName(match[1])) {
      const eventName = match[1];
      // If the name is already in the registry we patch, the throwing
      // renderer must be reading a different registry object — that is the
      // key diagnostic for this crash class, so log it explicitly.
      const alreadyRegistered = Boolean(
        directEventTypes && directEventTypes[eventName] != null,
      );

      if (directEventTypes && !alreadyRegistered) {
        try {
          directEventTypes[eventName] = synthesizeDirectEventConfig(eventName);
        } catch (_) {
          // Registration is best-effort; the swallow below still saves the app.
        }
      }

      console.error(
        '[HashPass][events] dropped unsupported native event instead of crashing',
        {
          eventName,
          wasFatal: Boolean(isFatal),
          alreadyRegistered,
        },
      );
      return;
    }

    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  });

  return true;
}

function installNativeEventRegistryPatch() {
  const directEventTypes = loadDirectEventTypes();
  // Even without a registry object the crash guard can still swallow the
  // fatal, so install it unconditionally.
  const crashGuardInstalled = installUnsupportedEventCrashGuard(directEventTypes);

  if (!directEventTypes) {
    return { installed: false, patched: [], crashGuardInstalled };
  }

  const patched = [];

  for (const [eventName, eventConfig] of Object.entries(
    ANDROID_DIRECT_EVENTS,
  )) {
    if (directEventTypes[eventName] == null) {
      directEventTypes[eventName] = eventConfig;
      patched.push(eventName);
    }
  }

  if (patched.length > 0) {
    console.log('[HashPass][events] installed native direct event fallbacks', {
      patched,
      crashGuardInstalled,
    });
  }

  return { installed: true, patched, crashGuardInstalled };
}

module.exports = {
  ANDROID_DIRECT_EVENTS,
  ANDROID_SCROLL_DIRECT_EVENTS: ANDROID_DIRECT_EVENTS,
  UNSUPPORTED_EVENT_MESSAGE_PATTERN,
  installNativeEventRegistryPatch,
};
