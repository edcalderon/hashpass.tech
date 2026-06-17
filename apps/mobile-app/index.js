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

// Load the router. Wrap in try-catch to surface synchronous module-eval errors.
try {
  require('expo-router/entry');
} catch (err) {
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
    console.error('[HashPass] Module load crash:', err);
  }
}
