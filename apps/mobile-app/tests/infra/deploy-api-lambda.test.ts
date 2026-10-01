/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const scriptPath = path.resolve(__dirname, '../../../../packages/tools/scripts/deploy-api-lambda.sh');

function runVersionGuard(liveVersion: string, targetVersion: string): number {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const match = source.match(/version_gt\(\) \{[\s\S]*?\n\}\n\nsync_lambda_environment/);
  if (!match) throw new Error('version_gt helper was not found');

  const helper = match[0].replace(/\n\nsync_lambda_environment$/, '');
  try {
    execFileSync('bash', ['-c', `${helper}\nversion_gt "$1" "$2"`, '--', liveVersion, targetVersion], {
      stdio: 'ignore',
    });
    return 0;
  } catch (error: any) {
    return error.status ?? 1;
  }
}

describe('deploy-api-lambda same-version guard', () => {
  it('deploys an equal-version API bundle and skips only a strictly newer live version', () => {
    expect(runVersionGuard('1.9.88', '1.9.88')).toBe(1);
    expect(runVersionGuard('1.9.89', '1.9.88')).toBe(0);
    expect(runVersionGuard('1.9.87', '1.9.88')).toBe(1);
  });

  it('rebuilds the Expo server bundle instead of trusting a matching version string in dist', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    const match = source.match(/ensure_fresh_api_bundle\(\) \{[\s\S]*?\n\}\n\nverify_api_version_once/);
    if (!match) throw new Error('ensure_fresh_api_bundle helper was not found');

    const helper = match[0];
    expect(helper).toContain('npm --prefix "${PROJECT_ROOT}/apps/mobile-app" run build:static');
    expect(helper).not.toContain('Using existing Expo API bundle');
    expect(helper).not.toContain('grep -Fq');
  });
});
