/// <reference types="jest" />

import { resolvePwaPromptVisibility } from '../../lib/pwa-utils';

describe('PWA prompt visibility', () => {
  it('keeps a manually opened prompt visible when a browser cannot issue a native install prompt', () => {
    expect(
      resolvePwaPromptVisibility({
        wasVisible: true,
        installed: false,
        isStandaloneMode: false,
        canInstall: false,
      }),
    ).toBe(true);
  });

  it('hides the prompt only after the app is confirmed installed in standalone mode', () => {
    expect(
      resolvePwaPromptVisibility({
        wasVisible: true,
        installed: true,
        isStandaloneMode: true,
        canInstall: false,
      }),
    ).toBe(false);
  });

  it('shows an available native install or an installed app opened in a browser tab', () => {
    expect(
      resolvePwaPromptVisibility({
        wasVisible: false,
        installed: false,
        isStandaloneMode: false,
        canInstall: true,
      }),
    ).toBe(true);
    expect(
      resolvePwaPromptVisibility({
        wasVisible: false,
        installed: true,
        isStandaloneMode: false,
        canInstall: false,
      }),
    ).toBe(true);
  });
});
