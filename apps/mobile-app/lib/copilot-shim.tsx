import React from 'react';

/**
 * Drop-in replacement for react-native-copilot's public API, used everywhere
 * the app previously imported from 'react-native-copilot' directly.
 *
 * react-native-copilot@3.3.3 crashes on Android under this app's Fabric/
 * newArch build with "Unsupported top level event type 'topLayout'
 * dispatched" — reproduced live on-device on v1.8.207, right after login,
 * as soon as a CopilotStep-wrapped view mounts on the dashboard. Two prior
 * targeted fixes (disabling tutorial auto-start via TUTORIAL_AUTO_START_ENABLED,
 * then patches/react-native-copilot@3.3.3.patch removing the unconditional
 * onLayout "Android hack" from CopilotStep's own render) both shipped and
 * both failed to stop the crash — CopilotStep still clones its child with a
 * ref via cloneElement, and the library also renders its own onLayout-bearing
 * View/Svg mask internally, so the Fabric event-registration mismatch has
 * more than one source inside this library. Given two narrow patches already
 * failed and this crash blocks every Android user from reaching the
 * dashboard after login, this shim removes react-native-copilot from the
 * render tree entirely instead of attempting a third unverified patch.
 *
 * All call sites already code defensively against a partial/missing Copilot
 * API (optional chaining, `typeof x === 'function'` checks, `as any` casts),
 * so swapping the import source is sufficient — no call-site changes needed.
 */

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type CopilotStepProps = {
  children: React.ReactElement;
  text?: string;
  order?: number;
  name?: string;
};

export function CopilotStep({ children }: CopilotStepProps) {
  return children;
}

export function walkthroughable<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return Component;
}

function noop() {}

export function useCopilot() {
  return {
    start: () => false,
    stop: noop,
    goToNext: noop,
    goToPrev: noop,
    goToNth: noop,
    handleNth: noop,
    currentStep: null,
    visible: false,
    totalStepsNumber: 0,
    copilotEvents: {
      on: noop,
      off: noop,
      emit: noop,
    },
  };
}
