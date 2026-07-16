/**
 * Custom entry point wrapping expo-router/entry.
 * Catches synchronous JS errors during module evaluation so they surface
 * as an Alert instead of a silent crash before AppErrorBoundary mounts.
 */

// Install global error handler as early as possible (before any requires).
if (typeof ErrorUtils !== 'undefined') {
  const _prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      try {
        const { Alert } = require('react-native');
        Alert.alert(
          '⚠️ Fatal JS Error',
          (error && error.name ? error.name + ': ' : '') +
            (error && error.message ? error.message : String(error)) +
            '\n\n' +
            (error && error.stack ? error.stack.slice(0, 600) : ''),
          [{ text: 'OK' }]
        );
      } catch (_) {
        // Alert unavailable — at least log it
        console.error('[HashPass] Fatal JS error:', error);
      }
    }
    if (_prev) _prev(error, isFatal);
  });
}

// Expo Router calls URLSearchParams.has while serializing navigation state.
// Older Hermes/RN globals ship a stub that throws "has is not implemented",
// which can crash native OAuth returns before the dashboard redirect runs.
try {
  require('./lib/polyfills/url-search-params').installURLSearchParamsPolyfill();
} catch (err) {
  console.error('[HashPass] Failed to install URLSearchParams polyfill:', err);
}

// RN 0.79 Android release builds can dispatch stock ScrollView events before
// the JS view config registry has loaded their direct-event declarations.
// Seed those declarations before expo-router renders auth/dashboard screens.
try {
  require('./lib/polyfills/native-event-registry').installNativeEventRegistryPatch();
} catch (err) {
  console.error('[HashPass] Failed to install native event registry patch:', err);
}

// Load the router. Wrap in try-catch to surface synchronous module-eval errors.
console.log('[HashPass][boot] requiring expo-router/entry');
try {
  require('expo-router/entry');
  console.log('[HashPass][boot] expo-router/entry evaluated OK');
} catch (err) {
  // Log FIRST so the real error reaches logcat even when Alert can't render
  // this early in old-bridge startup (a swallowed error here means no app
  // component registers, so AppRegistry.runApplication crashes with n=0 and
  // the app is stuck on the native splash — invisible without this log).
  console.error(
    '[HashPass][boot] expo-router/entry threw:',
    (err && err.name ? err.name + ': ' : '') +
      (err && err.message ? err.message : String(err)) +
      '\n' +
      (err && err.stack ? err.stack : 'no stack')
  );
  try {
    const { Alert } = require('react-native');
    Alert.alert(
      '⚠️ Startup Module Error',
      (err && err.name ? err.name + ': ' : '') +
        (err && err.message ? err.message : String(err)) +
        '\n\n' +
        (err && err.stack ? err.stack.slice(0, 600) : 'no stack'),
      [{ text: 'OK' }]
    );
  } catch (_) {
    console.error('[HashPass] Module load crash (alert unavailable):', err);
  }
}
