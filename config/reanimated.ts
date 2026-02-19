// This file ensures Reanimated is loaded before the app starts
// Only import react-native-reanimated in browser/native environments (not SSR)
if (typeof window !== 'undefined') {
  try {
    require('react-native-reanimated');
    
    // Configure Reanimated to use the native driver when possible
    // This helps with performance
    // @ts-ignore
    window._frameTimestamp = null;
    
    // Enable Layout Animations (only in browser)
    try {
      const { enableLayoutAnimations } = require('react-native-reanimated');
      enableLayoutAnimations(true);
    } catch (e) {
      // Reanimated not available, skip
    }
  } catch (e) {
    // Reanimated not available (SSR context), polyfill will handle it via Metro resolver
    console.warn('react-native-reanimated not available, using polyfill');
  }
}
