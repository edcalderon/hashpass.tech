/// <reference types="jest" />

import { getPwaInstallInstructionKeys, getPwaInstallBrowser } from '../../lib/pwa-install';

describe('PWA install browser guidance', () => {
  it('uses Safari home-screen guidance on iPhone', () => {
    expect(getPwaInstallBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('safari-ios');
    expect(getPwaInstallInstructionKeys('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toEqual([
      'instructions.safariIos',
    ]);
  });

  it('keeps iOS Chrome separate from Safari because it cannot expose Safari share instructions', () => {
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0.0.0 Mobile/15E148 Safari/604.1';

    expect(getPwaInstallBrowser(userAgent)).toBe('chrome-ios');
    expect(getPwaInstallInstructionKeys(userAgent)).toEqual(['instructions.chromeIos']);
  });

  it('uses the relevant Android menu path for Chrome and Firefox', () => {
    expect(getPwaInstallInstructionKeys('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36')).toEqual([
      'instructions.chromeAndroid',
    ]);
    expect(getPwaInstallInstructionKeys('Mozilla/5.0 (Android 15; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0')).toEqual([
      'instructions.firefoxAndroid',
    ]);
  });

  it('keeps iPad Safari on the iOS share-sheet guidance path', () => {
    const userAgent = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

    expect(getPwaInstallBrowser(userAgent)).toBe('safari-ios');
    expect(getPwaInstallInstructionKeys(userAgent)).toEqual(['instructions.safariIos']);
  });

  it('uses the generic fallback without treating desktop browsers as install-capable mobile agents', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';

    expect(getPwaInstallBrowser(userAgent)).toBe('browser');
    expect(getPwaInstallInstructionKeys(userAgent)).toEqual(['instructions.default']);
  });
});
