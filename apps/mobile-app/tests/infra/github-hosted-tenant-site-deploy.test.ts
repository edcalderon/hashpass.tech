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

  it('allows CBWeek production only as an explicit main-branch dispatch target', () => {
    const output = run(scripts[0], {
      BRANCH: 'main',
      TARGET: 'cbweek-production',
      EVENT_NAME: 'workflow_dispatch',
    });
    const [target] = JSON.parse(output.slice('matrix='.length)).include;

    expect(target).toMatchObject({
      target: 'cbweek-production',
      environment: 'production',
      bsl: false,
      artifactPath: 'dist',
    });
    expect(() => run(scripts[0], {
      BRANCH: 'develop',
      TARGET: 'cbweek-production',
      EVENT_NAME: 'workflow_dispatch',
    })).toThrow('Target does not match');
    expect(() => run(scripts[0], {
      BRANCH: 'main',
      TARGET: 'cbweek-production',
      EVENT_NAME: 'push',
    })).toThrow('dispatch path');
    expect(workflow).toContain('SITE_SKIP_LAMBDA_DEPLOY');
    expect(workflow).toContain('CBWEEK_STATIC_SITE_BUCKET');
    expect(workflow).toContain('CBWEEK_STATIC_SITE_DISTRIBUTION_ID');
    expect(workflow).toContain('CBWEEK_AWS_STATIC_SITE_DEPLOY_ROLE_ARN');
    expect(workflow).toContain('https://api.hashpass.tech/api/config/versions');
    expect(workflow).toContain("SITE_SKIP_LAMBDA_DEPLOY: ${{ matrix.target == 'cbweek-production' && 'true' || 'false' }}");
  });

  it('validates public settings with the shared script before each tenant build', () => {
    const build = workflow.split('\n  build:\n')[1].split('\n  migrate-database:\n')[0];

    expect(build).toContain(
      'PUBLIC_BUILD_ENV: ${{ matrix.target == \'cbweek-production\'',
    );
    expect(build).toContain(
      'node packages/tools/scripts/validate-tenant-public-build-env.mjs "$TARGET"',
    );
    expect(
      build.indexOf('validate-tenant-public-build-env.mjs'),
    ).toBeLessThan(
      build.indexOf('Build core or event site without AWS credentials'),
    );
  });

  it('uses credentialless free builds and serialized, target-scoped deployments', () => {
    const build = workflow.split('\n  build:\n')[1].split('\n  migrate-database:\n')[0];
    const migrate = workflow.split('\n  migrate-database:\n')[1].split('\n  deploy:\n')[0];
    const deploy = workflow.split('\n  deploy:\n')[1];
    expect(build).toContain('runs-on: ubuntu-latest');
    expect(build).toContain('retention-days: 1');
    expect(build).not.toContain('id-token: write');
    expect(build).not.toContain('configure-aws-credentials');
    expect(migrate).toContain('id-token: write');
    expect(migrate).toContain("inputs.target != 'cbweek-production'");
    expect(deploy).toContain('runs-on: ubuntu-latest');
    expect(deploy).toContain('environment: ${{ matrix.environment }}');
    expect(deploy).toContain('group: static-site-deploy-${{ matrix.target }}');
    expect(deploy).toContain('cancel-in-progress: false');
    expect(deploy).toContain('EXPECTED_AWS_ACCOUNT_ID: ${{ vars.AWS_TARGET_ACCOUNT_ID }}');
    expect(deploy).not.toContain('allowed-account-ids:');
    expect(deploy).toContain('SITE_API_VERSION_URL');
    expect(deploy).toContain("inputs.target == 'cbweek-production'");
    expect(deploy).toContain("needs.migrate-database.result == 'success'");
    expect(deploy).toContain("needs.build.result == 'success'");
    expect(deploy).toContain('!cancelled()');
    expect(workflow).toContain('default: false');
    expect(workflow).not.toContain('start-pipeline-execution');
    expect(workflow).not.toContain('start-build');
  });
});
