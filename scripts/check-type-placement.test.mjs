import assert from 'node:assert/strict';
import {
  buildDiffArgs,
  findTypePlacementViolations,
} from './check-type-placement.mjs';

assert.deepEqual(buildDiffArgs({ TYPE_PLACEMENT_STAGED: '1' }), [
  'diff',
  '--unified=0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--cached',
  '--',
  'apps',
  'packages',
]);

assert.deepEqual(buildDiffArgs({ TYPE_PLACEMENT_BASE: 'origin/main' }), [
  'diff',
  '--unified=0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  'origin/main...HEAD',
  '--',
  'apps',
  'packages',
]);

assert.deepEqual(buildDiffArgs({}), [
  'diff',
  '--unified=0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  'HEAD',
  '--',
  'apps',
  'packages',
]);

{
  const diff = [
    '+++ b/apps/mobile-app/components/ProfileCard.tsx',
    '@@ -1,0 +1,3 @@',
    '+interface ProfileCardProps {',
    '+  name: string;',
    '+}',
    '+type ProfileMode = "compact";',
  ].join('\n');

  assert.deepEqual(findTypePlacementViolations(diff), [
    {
      filePath: 'apps/mobile-app/components/ProfileCard.tsx',
      line: 1,
      kind: 'interface',
      name: 'ProfileCardProps',
    },
    {
      filePath: 'apps/mobile-app/components/ProfileCard.tsx',
      line: 4,
      kind: 'type',
      name: 'ProfileMode',
    },
  ]);
}

{
  const diff = [
    '+++ b/packages/auth/src/providers/better-auth.ts',
    '@@ -1,0 +1,3 @@',
    '+export type NativeSignInOptions = {',
    '+  signal?: AbortSignal;',
    '+};',
    '+++ b/apps/mobile-app/app/api/auth/route.ts',
    '@@ -1,0 +1,2 @@',
    '+declare interface AuthRouteContext {',
    '+  request: Request;',
  ].join('\n');

  assert.deepEqual(findTypePlacementViolations(diff), [
    {
      filePath: 'packages/auth/src/providers/better-auth.ts',
      line: 1,
      kind: 'type',
      name: 'NativeSignInOptions',
    },
    {
      filePath: 'apps/mobile-app/app/api/auth/route.ts',
      line: 1,
      kind: 'interface',
      name: 'AuthRouteContext',
    },
  ]);
}

{
  const diff = [
    '+++ b/apps/mobile-app/components/types/ProfileCard.types.ts',
    '@@ -1,0 +1,1 @@',
    '+export interface ProfileCardProps {}',
    '+++ b/apps/mobile-app/components/ProfileCard.test.tsx',
    '@@ -1,0 +1,1 @@',
    '+type Fixture = { name: string };',
  ].join('\n');

  assert.deepEqual(findTypePlacementViolations(diff), []);
}

{
  const diff = [
    '+++ b/apps/mobile-app/components/ProfileCard.tsx',
    '@@ -1,3 +1,2 @@',
    '-interface ProfileCardProps {}',
    ' const value = true;',
  ].join('\n');

  assert.deepEqual(findTypePlacementViolations(diff), []);
}

console.log('Type placement guard tests passed (7 cases).');
