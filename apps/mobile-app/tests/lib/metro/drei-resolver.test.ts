/// <reference types="jest" />

import fs from 'fs';
import os from 'os';
import path from 'path';

const { resolveDreiCommonJs } = require('../../../lib/metro/drei-resolver');

describe('drei resolver', () => {
  let packageDir: string;

  beforeEach(() => {
    packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drei-resolver-'));
    fs.mkdirSync(path.join(packageDir, 'web'), { recursive: true });
    fs.mkdirSync(path.join(packageDir, 'core'), { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'index.cjs.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(packageDir, 'web', 'index.cjs.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(packageDir, 'web', 'KeyboardControls.cjs.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(packageDir, 'core', 'index.cjs.js'), 'module.exports = {};');
  });

  afterEach(() => {
    fs.rmSync(packageDir, { recursive: true, force: true });
  });

  it('resolves the web ESM entry to CommonJS on web builds', () => {
    expect(resolveDreiCommonJs('@react-three/drei', packageDir)).toBe(path.join(packageDir, 'index.cjs.js'));
    expect(resolveDreiCommonJs('@react-three/drei/web/index.js', packageDir)).toBe(path.join(packageDir, 'web', 'index.cjs.js'));
    expect(resolveDreiCommonJs('@react-three/drei/web/KeyboardControls.js', packageDir)).toBe(path.join(packageDir, 'web', 'KeyboardControls.cjs.js'));
    expect(resolveDreiCommonJs('@react-three/drei/core/index.js', packageDir)).toBe(path.join(packageDir, 'core', 'index.cjs.js'));
  });

  it('returns null for unrelated modules', () => {
    expect(resolveDreiCommonJs('zustand', packageDir)).toBeNull();
    expect(resolveDreiCommonJs('@react-three/fiber', packageDir)).toBeNull();
  });
});
