import fs from 'node:fs';
import path from 'node:path';
import appConfig from '../../app.json';

const appRoot = path.resolve(__dirname, '../..');

describe('mobile web viewport stability', () => {
  it('uses the dynamic keyboard viewport while preserving browser zoom', () => {
    const viewport = appConfig.expo.web.meta.viewport;

    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).toContain('interactive-widget=resizes-content');
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toContain('maximum-scale=1');
  });

  it('keeps the HTML fallback and global mobile styles aligned with the manifest', () => {
    const htmlSource = fs.readFileSync(path.join(appRoot, 'app/+html.tsx'), 'utf8');
    const styleSource = fs.readFileSync(path.join(appRoot, 'components/DesignSystemStyles.web.tsx'), 'utf8');

    expect(htmlSource).toContain(appConfig.expo.web.meta.viewport);
    expect(styleSource).toContain('min-height: 100dvh');
    expect(styleSource).toContain('-webkit-text-size-adjust: 100%');
    expect(styleSource).toContain('font-size: max(16px, 1em)');
  });
});
