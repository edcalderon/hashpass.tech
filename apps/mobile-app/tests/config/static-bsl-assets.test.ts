/// <reference types="jest" />

import appPackage from '../../package.json';

describe('static BSL asset publishing', () => {
  it.each(['postbuild:web', 'postbuild:static'] as const)(
    'copies BSL SVGs into the deployable client output for %s',
    (scriptName) => {
      expect(appPackage.scripts[scriptName]).toContain('dist/client/assets/logos/bsl');
      expect(appPackage.scripts[scriptName]).toContain('cp assets/logos/bsl/*.svg dist/client/assets/logos/bsl/');
    },
  );
});
