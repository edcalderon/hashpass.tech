'use strict';

const ANDROID_SCROLL_DIRECT_EVENTS = {
  // Stock ScrollView direct events that can arrive before RN's generated
  // view config registry has registered them in Android release bundles.
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
};

function installNativeEventRegistryPatch() {
  let registry;

  try {
    registry = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');
  } catch (error) {
    console.warn('[HashPass][events] React Native view config registry unavailable', {
      message: error && error.message ? error.message : String(error),
    });
    return { installed: false, patched: [] };
  }

  const directEventTypes = registry && registry.customDirectEventTypes;

  if (!directEventTypes || typeof directEventTypes !== 'object') {
    console.warn('[HashPass][events] React Native direct event registry missing');
    return { installed: false, patched: [] };
  }

  const patched = [];

  for (const [eventName, eventConfig] of Object.entries(
    ANDROID_SCROLL_DIRECT_EVENTS,
  )) {
    if (directEventTypes[eventName] == null) {
      directEventTypes[eventName] = eventConfig;
      patched.push(eventName);
    }
  }

  if (patched.length > 0) {
    console.log('[HashPass][events] installed native direct event fallbacks', {
      patched,
    });
  }

  return { installed: true, patched };
}

module.exports = {
  ANDROID_SCROLL_DIRECT_EVENTS,
  installNativeEventRegistryPatch,
};
