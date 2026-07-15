/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('Android layout event crash guards', () => {
  it('does not attach landing page onLayout handlers on Android', () => {
    const source = readSource('../../app/home.tsx');

    expect(source).toContain('onLayout={Platform.OS === "android" ? undefined : handleInitialScrollLayout}');
    expect(source).toContain('Platform.OS === "android"');
    expect(source).toContain('featuresLayoutRef.current = { y };');
  });

  it('does not attach dashboard quick-access onLayout on Android', () => {
    const source = readSource('../../app/(shared)/dashboard/explore.tsx');

    expect(source).toContain("onLayout={Platform.OS === 'android' ? undefined : handleQuickAccessLayout}");
    expect(source).toContain("if (Platform.OS === 'android' && viewportWidthRef.current <= 0)");
  });

  it('uses the black full HASHPASS logo on light native surfaces', () => {
    const logoSource = readSource('../../lib/hashpass-logo.ts');
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(logoSource).toContain('logo-full-hashpass-black.png');
    expect(dashboardSource).toContain("require('../../../assets/logos/hashpass/logo-full-hashpass-black.png')");
  });
});
