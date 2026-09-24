export type PwaInstallBrowser =
  | 'safari-ios'
  | 'chrome-ios'
  | 'firefox-ios'
  | 'chrome-android'
  | 'firefox-android'
  | 'browser';

export const getPwaInstallBrowser = (userAgent: string): PwaInstallBrowser => {
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);

  if (isIos) {
    if (/CriOS/i.test(userAgent)) return 'chrome-ios';
    if (/FxiOS/i.test(userAgent)) return 'firefox-ios';
    return 'safari-ios';
  }

  if (isAndroid && /Firefox/i.test(userAgent)) return 'firefox-android';
  if (isAndroid && /Chrome|Chromium|EdgA/i.test(userAgent)) return 'chrome-android';

  return 'browser';
};

export const getPwaInstallInstructionKeys = (userAgent: string): string[] => {
  switch (getPwaInstallBrowser(userAgent)) {
    case 'safari-ios':
      return ['instructions.safariIos'];
    case 'chrome-ios':
      return ['instructions.chromeIos'];
    case 'firefox-ios':
      return ['instructions.firefoxIos'];
    case 'chrome-android':
      return ['instructions.chromeAndroid'];
    case 'firefox-android':
      return ['instructions.firefoxAndroid'];
    default:
      return ['instructions.default'];
  }
};
