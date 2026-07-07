/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const mobileAppRoot = path.resolve(__dirname, '../../');
const repoRoot = path.resolve(mobileAppRoot, '../..');

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const readJson = (relativePath: string) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')) as Record<string, any>;

describe('README versioning sync', () => {
  it('keeps the root README badge and latest changes block aligned with the tracked release version', () => {
    const rootPackageJson = readJson(path.relative(__dirname, path.join(repoRoot, 'package.json')));
    const changelog = readSource(path.relative(__dirname, path.join(repoRoot, 'CHANGELOG.md')));
    const readme = readSource(path.relative(__dirname, path.join(repoRoot, 'README.md')));
    const mobileAppJson = readJson('../../app.json').expo as Record<string, any>;
    const productionVersion = readJson('../../config/version.production.json') as { version: string };
    const developmentVersion = readJson('../../config/version.development.json') as {
      version: string;
    };

    const changelogVersion = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];

    expect(changelogVersion).toBe(rootPackageJson.version);
    expect(mobileAppJson.version).toBe(rootPackageJson.version);
    expect(productionVersion.version).toBe(rootPackageJson.version);
    expect(developmentVersion.version).toBe(rootPackageJson.version);
    expect(readme).toContain(
      'https://img.shields.io/github/v/tag/hashpass-tech/hashpass.tech?label=tracked%20version',
    );
    expect(readme).toContain('https://img.shields.io/badge/release-patch-8b5cf6?style=flat-square');
    expect(readme).toContain(`## 📋 Latest Changes (v${rootPackageJson.version})`);
    expect(readme).toContain('For full version history, see [CHANGELOG.md]');
  });
});
