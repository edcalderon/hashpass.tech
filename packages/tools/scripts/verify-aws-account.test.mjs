import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptsDirectory = import.meta.dirname;
const repositoryRoot = resolve(scriptsDirectory, '../../..');
const verifierPath = join(scriptsDirectory, 'verify-aws-account.sh');

function runVerifier({ expectedAccount, actualAccount = '', awsExitCode = 0, awsStderr = '', githubActions = false }) {
  const directory = mkdtempSync(join(tmpdir(), 'hashpass-aws-account-check-'));
  const awsCallLog = join(directory, 'aws-call.log');
  const fakeAwsPath = join(directory, 'aws');
  writeFileSync(
    fakeAwsPath,
    '#!/usr/bin/env bash\nprintf "%s" "$*" > "$AWS_CALL_LOG"\nprintf "%s\\n" "$FAKE_AWS_STDERR" >&2\nprintf "%s\\n" "$FAKE_AWS_ACCOUNT"\nexit "$FAKE_AWS_EXIT_CODE"\n',
  );
  chmodSync(fakeAwsPath, 0o755);

  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH ?? ''}`,
    AWS_CALL_LOG: awsCallLog,
    FAKE_AWS_ACCOUNT: actualAccount,
    FAKE_AWS_EXIT_CODE: String(awsExitCode),
    FAKE_AWS_STDERR: awsStderr,
    GITHUB_ACTIONS: String(githubActions),
  };
  if (expectedAccount === undefined) delete env.EXPECTED_AWS_ACCOUNT_ID;
  else env.EXPECTED_AWS_ACCOUNT_ID = expectedAccount;

  const result = spawnSync('bash', [verifierPath], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
  });
  const awsCalled = existsSync(awsCallLog);
  const awsArguments = awsCalled ? readFileSync(awsCallLog, 'utf8') : '';
  rmSync(directory, { recursive: true, force: true });
  return { result, awsCalled, awsArguments };
}

test('accepts only the matching AWS caller account without printing account IDs', () => {
  const account = '123456789012';
  const { result, awsCalled, awsArguments } = runVerifier({
    expectedAccount: account,
    actualAccount: account,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(awsCalled, true);
  assert.equal(awsArguments, 'sts get-caller-identity --query Account --output text');
  assert.match(result.stdout, /AWS caller account verified/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(account), false);
});

test('registers both account IDs for masking in GitHub Actions logs', () => {
  const expectedAccount = '123456789012';
  const actualAccount = '210987654321';
  const { result } = runVerifier({ expectedAccount, actualAccount, githubActions: true });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, new RegExp(`::add-mask::${expectedAccount}`));
  assert.match(result.stdout, new RegExp(`::add-mask::${actualAccount}`));
  assert.match(result.stderr, /AWS caller account does not match the expected account/);
});

test('fails before calling AWS when the expected account is absent or malformed', () => {
  for (const expectedAccount of [undefined, '', 'not-an-account', '1234']) {
    const { result, awsCalled } = runVerifier({ expectedAccount, actualAccount: '123456789012' });

    assert.notEqual(result.status, 0, `expected ${JSON.stringify(expectedAccount)} to fail`);
    assert.match(`${result.stdout}${result.stderr}`, /EXPECTED_AWS_ACCOUNT_ID must be a valid 12-digit AWS account ID/);
    assert.equal(awsCalled, false, `AWS should not be queried for ${JSON.stringify(expectedAccount)}`);
    assert.equal(`${result.stdout}${result.stderr}`.includes('123456789012'), false);
  }
});

test('fails without exposing either account ID when the assumed account mismatches', () => {
  const expectedAccount = '123456789012';
  const actualAccount = '210987654321';
  const { result, awsCalled } = runVerifier({ expectedAccount, actualAccount });

  assert.notEqual(result.status, 0);
  assert.equal(awsCalled, true);
  assert.match(`${result.stdout}${result.stderr}`, /AWS caller account does not match the expected account/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(expectedAccount), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes(actualAccount), false);
});

test('fails closed when STS returns a malformed caller account', () => {
  const expectedAccount = '123456789012';
  const malformedCaller = 'not-an-account';
  const { result, awsCalled } = runVerifier({ expectedAccount, actualAccount: malformedCaller });

  assert.notEqual(result.status, 0);
  assert.equal(awsCalled, true);
  assert.match(`${result.stdout}${result.stderr}`, /AWS caller identity lookup failed/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(expectedAccount), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes(malformedCaller), false);
});

test('fails closed when STS lookup fails and suppresses provider output', () => {
  const leakedAccount = '123456789012';
  const { result, awsCalled } = runVerifier({
    expectedAccount: leakedAccount,
    awsExitCode: 1,
    awsStderr: `credential response mentioned ${leakedAccount}`,
  });

  assert.notEqual(result.status, 0);
  assert.equal(awsCalled, true);
  assert.match(`${result.stdout}${result.stderr}`, /AWS caller identity lookup failed/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(leakedAccount), false);
});

test('release-triggered AWS jobs verify identity after role assumption and before mutation', () => {
  const read = (relativePath) => readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
  const migrationAction = read('.github/actions/apply-core-db-migrations/action.yml');
  const staticWorkflow = read('.github/workflows/github-hosted-static-site-deploy.yml');
  const tenantWorkflow = read('.github/workflows/github-hosted-tenant-site-deploy.yml');
  const infraWorkflow = read('.github/workflows/infra-deploy.yml');
  const androidWorkflow = read('.github/workflows/mobile-android-release.yml');
  const coverageWorkflow = read('.github/workflows/codecov.yml');

  const staticCredentialsIndex = staticWorkflow.indexOf('Configure AWS credentials (OIDC)');
  const staticVerifierIndex = staticWorkflow.indexOf('Verify AWS account before static deployment');
  const staticMutationIndex = staticWorkflow.indexOf('Deploy the verified static site');
  assert.ok(staticCredentialsIndex < staticVerifierIndex && staticVerifierIndex < staticMutationIndex);

  const tenantCredentialsIndex = tenantWorkflow.indexOf('Configure deployment credentials');
  const tenantVerifierIndex = tenantWorkflow.indexOf('Verify AWS account before static deployment');
  const tenantMutationIndex = tenantWorkflow.indexOf('- name: Deploy the verified artifact');
  assert.ok(tenantCredentialsIndex < tenantVerifierIndex && tenantVerifierIndex < tenantMutationIndex);

  const migrationCredentialsIndex = migrationAction.indexOf('Configure production pre-migration backup credentials');
  const migrationVerifierIndex = migrationAction.indexOf('verify-aws-account.sh');
  const migrationMutationIndex = migrationAction.indexOf('Apply pending migrations');
  assert.ok(migrationCredentialsIndex < migrationVerifierIndex && migrationVerifierIndex < migrationMutationIndex);
  assert.match(migrationAction, /EXPECTED_AWS_ACCOUNT_ID:\s*\$\{\{ inputs\.aws-account-id \}\}/);

  assert.match(staticWorkflow, /EXPECTED_AWS_ACCOUNT_ID:\s*\$\{\{ vars\.AWS_TARGET_ACCOUNT_ID \}\}/);
  assert.doesNotMatch(tenantWorkflow, /allowed-account-ids:/);
  assert.match(tenantWorkflow, /EXPECTED_AWS_ACCOUNT_ID:\s*\$\{\{ vars\.AWS_TARGET_ACCOUNT_ID \}\}/);

  const infraDeployJob = infraWorkflow.split('\n  deploy:\n')[1];
  assert.ok(infraDeployJob);
  assert.match(
    infraDeployJob,
    /environment:\s*\$\{\{ github\.ref_name == 'main' && 'production' \|\| 'bsl-development' \}\}/,
  );
  assert.doesNotMatch(infraDeployJob.split('steps:')[0], /EXPECTED_AWS_ACCOUNT_ID/);

  const infrastructureAccountCheck = infraDeployJob
    .split('Verify AWS account before infrastructure deployment')[1]
    ?.split('Deploy production')[0];
  assert.ok(infrastructureAccountCheck);
  assert.match(
    infrastructureAccountCheck,
    /EXPECTED_AWS_ACCOUNT_ID:\s*\$\{\{ vars\.AWS_TARGET_ACCOUNT_ID \}\}/,
  );

  const apiAccountCheck = infraDeployJob
    .split('Verify target AWS account before API Lambda deployment')[1]
    ?.split('Deploy production API Lambda')[0];
  assert.ok(apiAccountCheck);
  assert.match(
    apiAccountCheck,
    /EXPECTED_AWS_ACCOUNT_ID:\s*\$\{\{ vars\.AWS_TARGET_ACCOUNT_ID \}\}/,
  );
  assert.match(coverageWorkflow, /node --test packages\/tools\/scripts\/verify-aws-account\.test\.mjs/);
  const infraCredentialsIndex = infraWorkflow.indexOf('Configure AWS credentials');
  const infraVerifierIndex = infraWorkflow.indexOf('Verify AWS account before infrastructure deployment');
  const infraMutationIndex = infraWorkflow.indexOf('Deploy production');
  assert.ok(infraCredentialsIndex < infraVerifierIndex && infraVerifierIndex < infraMutationIndex);

  const apiCredentialsIndex = infraWorkflow.indexOf('Configure target AWS credentials for API Lambda');
  const apiVerifierIndex = infraWorkflow.indexOf('Verify target AWS account before API Lambda deployment');
  const apiDeployIndex = infraWorkflow.indexOf('Deploy production API Lambda');
  assert.ok(apiCredentialsIndex < apiVerifierIndex && apiVerifierIndex < apiDeployIndex);

  const androidStartJob = androidWorkflow.split('\n  start-runner:\n')[1].split('\n  release:\n')[0];
  const androidStopJob = androidWorkflow.slice(androidWorkflow.indexOf('\n  stop-runner:\n'));
  assert.ok(androidStartJob.indexOf('Checkout account verifier') < androidStartJob.indexOf('Configure AWS credentials (OIDC)'));
  assert.ok(androidStopJob.indexOf('Checkout account verifier') < androidStopJob.indexOf('Configure AWS credentials (OIDC)'));

  const androidStartCredentialsIndex = androidWorkflow.indexOf('Configure AWS credentials (OIDC)');
  const androidStartVerifierIndex = androidWorkflow.indexOf('Verify AWS account before starting runner');
  const androidStartMutationIndex = androidWorkflow.indexOf('Start EC2 instance');
  assert.ok(androidStartCredentialsIndex < androidStartVerifierIndex && androidStartVerifierIndex < androidStartMutationIndex);

  const androidStopCredentialsIndex = androidWorkflow.indexOf('Configure AWS credentials (OIDC)', androidStartCredentialsIndex + 1);
  const androidStopVerifierIndex = androidWorkflow.indexOf('Verify AWS account before stopping runner');
  const androidStopMutationIndex = androidWorkflow.indexOf('Stop EC2 instance (queue-aware)');
  assert.ok(androidStopCredentialsIndex < androidStopVerifierIndex && androidStopVerifierIndex < androidStopMutationIndex);
  assert.match(androidWorkflow, /EXPECTED_AWS_ACCOUNT_ID:\s*\$\{\{ vars\.AWS_TARGET_ACCOUNT_ID \}\}/);
  assert.ok(androidWorkflow.includes('run: bash packages/tools/scripts/verify-aws-account.sh'));
});
