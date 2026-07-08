// This file ensures Reanimated is loaded before the app starts
// Only import react-native-reanimated in browser/native environments (not SSR)
if (typeof window !== 'undefined') {
  try {
    require('react-native-reanimated');

    // @ts-ignore
    window._frameTimestamp = null;

    try {
      if (typeof document === 'undefined') {
        const { enableLayoutAnimations } = require('react-native-reanimated');
        enableLayoutAnimations(true);
      }
    } catch {
      // Reanimated not available, skip
    }
  } catch {
    // Reanimated not available (SSR context), polyfill will handle it via Metro resolver
    console.warn('react-native-reanimated not available, using polyfill');
  }
}
