/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';
import appPackage from '../../package.json';

describe('static BSL asset publishing', () => {
  it.each(['postbuild:web', 'postbuild:static'] as const)(
    'copies BSL SVGs into the deployable client output for %s',
    (scriptName) => {
      expect(appPackage.scripts[scriptName]).toContain('dist/client/assets/logos/bsl');
      expect(appPackage.scripts[scriptName]).toContain('cp assets/logos/bsl/*.svg dist/client/assets/logos/bsl/');
    },
  );

  it('uses a bundled BSL logo by default so Metro never resolves a logo directory request', () => {
    const explorerHeader = fs.readFileSync(
      path.resolve(__dirname, '../../components/explorer/ExplorerHeader.tsx'),
      'utf8',
    );
    const bundledLogo = path.resolve(__dirname, '../../assets/logos/bsl/bsl-colombia-pro.webp');

    expect(explorerHeader).toContain("require('../../assets/logos/bsl/bsl-colombia-pro.webp')");
    expect(fs.existsSync(bundledLogo)).toBe(true);
  });
});
