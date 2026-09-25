/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/github-hosted-tenant-site-deploy.yml'), 'utf8');
const scripts = [...workflow.matchAll(/node <<'NODE'\n([\s\S]*?)\n\s+NODE/g)]
  .map(match => match[1].replace(/^          /gm, ''));

function run(script: string, env: Record<string, string>) {
  const writes: string[] = [];
  vm.runInNewContext(script, {
    process: { env: { GITHUB_OUTPUT: 'output', GITHUB_ENV: 'env', ...env } },
    require: (name: string) => {
      expect(name).toBe('node:fs');
      return { appendFileSync: (_file: string, value: string) => writes.push(value) };
    },
  });
  return writes.join('');
}

describe('free GitHub tenant builds', () => {
  it.each([
    ['develop', ['cbweek-development', 'bsl-development']],
    ['main', ['production', 'bsl-production']],
  ])('routes %s only to its approved targets', (branch, expected) => {
    const output = run(scripts[0], { BRANCH: branch as string });
    const matrix = JSON.parse(output.slice('matrix='.length));
    expect(matrix.include.map((item: { environment: string }) => item.environment)).toEqual(expected);
    expect(matrix.include[0].artifactPath).toBe('dist');
    expect(matrix.include[1].artifactPath).toBe('apps/mobile-app/dist');
  });

  it.each([
    ['develop', 'production'], ['main', 'bsl-development'], ['feature/untrusted', 'production'],
  ])('rejects the mismatched branch/target %s / %s', (branch, target) => {
    expect(() => run(scripts[0], { BRANCH: branch, TARGET: target })).toThrow('Target does not match');
  });

  it('allows one explicitly selected target on its approved branch', () => {
    const output = run(scripts[0], { BRANCH: 'main', TARGET: 'bsl-production' });
    expect(JSON.parse(output.slice('matrix='.length)).include).toHaveLength(1);
  });

  it('loads only public target settings', () => {
    expect(run(scripts[1], { PUBLIC_BUILD_ENV: JSON.stringify({ EXPO_PUBLIC_API_BASE_URL: 'https://api.example.test', BUILD_ENV: 'prod' }) }))
      .toBe('EXPO_PUBLIC_API_BASE_URL=https://api.example.test\nBUILD_ENV=prod\n');
  });

  it.each([
    {}, { AWS_SECRET_ACCESS_KEY: 'secret' }, { EXPO_PUBLIC_SERVICE_ROLE_KEY: 'secret' },
    { EXPO_PUBLIC_PASSWORD: 'secret' }, { BUILD_ENV: 'prod\nAWS_PROFILE=other' }, { BUILD_ENV: 42 },
  ])('rejects missing, private or injectable build configuration %j', config => {
    expect(() => run(scripts[1], { PUBLIC_BUILD_ENV: JSON.stringify(config) })).toThrow();
  });

  it('uses credentialless free builds and serialized, target-scoped deployments', () => {
    const build = workflow.split('\n  build:\n')[1].split('\n  deploy:\n')[0];
    const deploy = workflow.split('\n  deploy:\n')[1];
    expect(build).toContain('runs-on: ubuntu-latest');
    expect(build).toContain('retention-days: 1');
    expect(build).not.toContain('id-token: write');
    expect(build).not.toContain('configure-aws-credentials');
    expect(deploy).toContain('runs-on: ubuntu-latest');
    expect(deploy).toContain('environment: ${{ matrix.environment }}');
    expect(deploy).toContain('group: static-site-deploy-${{ matrix.environment }}');
    expect(deploy).toContain('cancel-in-progress: false');
    expect(deploy).toContain('allowed-account-ids: ${{ vars.AWS_TARGET_ACCOUNT_ID }}');
    expect(deploy).toContain('SITE_API_VERSION_URL');
    expect(workflow).toContain('default: false');
    expect(workflow).not.toContain('start-pipeline-execution');
    expect(workflow).not.toContain('start-build');
  });
});
