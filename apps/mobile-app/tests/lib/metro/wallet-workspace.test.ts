import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Evaluate only the two declarative configuration lists, without starting
// NativeWind or propagating environment files during the test run.
const root = path.resolve(__dirname, '../../../../..');
const config = fs.readFileSync(path.join(root, 'apps/mobile-app/metro.config.js'), 'utf8');
function list(name: string): any[] {
  const source = config.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`))?.[1];
  if (!source) throw new Error(`Missing Metro config list: ${name}`);
  return vm.runInNewContext(source);
}
const excluded = (file: string) => list('blockListPatterns').some((pattern: RegExp) => pattern.test(file));
it('watches the wallet workspace and resolves its public manifest entry', () => {
  expect(list('runtimeWorkspacePackages')).toContain('wallet');
  const requireApp = createRequire(path.join(root, 'apps/mobile-app/package.json'));
  expect(requireApp.resolve('@hashpass/wallet/manifest')).toBe(path.join(root, 'packages/wallet/src/manifest.ts'));
});
it('keeps workspace build outputs excluded without hiding dependency artifacts', () => {
  expect(excluded(path.join(root, 'packages/wallet/dist/index.js'))).toBe(true);
  expect(excluded(path.join(root, 'packages/wallet/node_modules/@adraffy/ens-normalize/dist/index.mjs'))).toBe(false);
  expect(excluded(path.join(root, 'packages/wallet/node_modules/ethers/node_modules/@noble/hashes/ripemd160.js'))).toBe(false);
  expect(excluded(path.join(root, 'packages/wallet/node_modules/@noble/curves/node_modules/@noble/hashes/sha256.js'))).toBe(false);
  expect(excluded(path.join(root, 'node_modules/ethers/node_modules/@noble/hashes/sha256.js'))).toBe(false);
});
