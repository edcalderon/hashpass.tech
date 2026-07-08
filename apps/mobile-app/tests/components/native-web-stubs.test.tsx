/// <reference types="jest" />

import CrystalForgeBackground from '../../components/CrystalForgeBackground.native';
import WebQRScanner from '../../components/WebQRScanner.native';

describe('native web-only component stubs', () => {
  it('does not render the web-only crystal background on native', () => {
    expect(CrystalForgeBackground({
      isDarkMode: true,
      enableClickSpawn: true,
      maxCrystals: 24,
    })).toBeNull();
  });

  it('does not render the web QR scanner on native', () => {
    expect(WebQRScanner({
      visible: true,
      onClose: jest.fn(),
      onScanSuccess: jest.fn(),
      onError: jest.fn(),
      title: 'Scan',
    })).toBeNull();
  });
});
