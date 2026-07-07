import React from 'react';
import { Platform } from 'react-native';

// Fallback entry point used when a platform-specific variant is not selected.
// Keep this file safe on every platform and only delegate to the web variant
// when we are actually running in a browser.
export default function ShaderAnimation() {
  if (Platform.OS !== 'web') {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebShaderAnimation = require('./ShaderAnimation.web').default as React.ComponentType;
  return <WebShaderAnimation />;
}
