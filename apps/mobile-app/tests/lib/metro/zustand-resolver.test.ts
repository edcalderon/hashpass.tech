/// <reference types="jest" />

import fs from 'fs';
import os from 'os';
import path from 'path';

const { resolveZustandCommonJs, normalizeZustandSubpath } = require('../../../lib/metro/zustand-resolver');

describe('zustand resolver', () => {
  let packageDir: string;

  beforeEach(() => {
    packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zustand-resolver-'));
    fs.mkdirSync(path.join(packageDir, 'react'), { recursive: true });
    fs.mkdirSync(path.join(packageDir, 'middleware'), { recursive: true });
    fs.mkdirSync(path.join(packageDir, 'esm'), { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(packageDir, 'middleware.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(packageDir, 'react', 'shallow.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(packageDir, 'esm', 'index.mjs'), 'export * from "./middleware.mjs";');
  });

  afterEach(() => {
    fs.rmSync(packageDir, { recursive: true, force: true });
  });

  it('maps zustand esm imports to CommonJS files', () => {
    expect(normalizeZustandSubpath('zustand')).toBe('index');
    expect(normalizeZustandSubpath('zustand/esm')).toBe('index');
    expect(normalizeZustandSubpath('zustand/middleware')).toBe('middleware');
    expect(normalizeZustandSubpath('zustand/esm/middleware.mjs')).toBe('middleware');
    expect(normalizeZustandSubpath('zustand/esm/react/shallow.mjs')).toBe('react/shallow');

    expect(resolveZustandCommonJs('zustand', packageDir)).toBe(path.join(packageDir, 'index.js'));
    expect(resolveZustandCommonJs('zustand/esm/middleware.mjs', packageDir)).toBe(path.join(packageDir, 'middleware.js'));
    expect(resolveZustandCommonJs('zustand/esm/react/shallow.mjs', packageDir)).toBe(path.join(packageDir, 'react', 'shallow.js'));
    expect(
      resolveZustandCommonJs(
        './middleware.mjs',
        packageDir,
        path.join(packageDir, 'esm', 'index.mjs'),
      ),
    ).toBe(path.join(packageDir, 'middleware.js'));
  });

  it('returns null for unknown zustand subpaths', () => {
    expect(resolveZustandCommonJs('zustand/esm/unknown.mjs', packageDir)).toBeNull();
    expect(resolveZustandCommonJs('not-zustand', packageDir)).toBeNull();
  });
});
