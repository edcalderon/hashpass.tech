/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(
  __dirname,
  '../../../../.github/workflows/github-hosted-static-site-deploy.yml',
);

describe('GitHub-hosted static-site deployment workflow', () => {
  it('keeps development builds manual and credentialless by default', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('deploy:');
    expect(workflow).toContain('default: false');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain('Build the static site');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain("if: inputs.deploy == true");
    expect(workflow).toContain('BUILD_ENV: dev');
    expect(workflow).not.toContain('production');
  });

  it('requires a protected environment and uses the existing deploy scripts', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('environment: development');
    expect(workflow).toContain('aws-actions/configure-aws-credentials@v4');
    expect(workflow).toContain('packages/tools/scripts/build-static-site.sh');
    expect(workflow).toContain('packages/tools/scripts/deploy-static-site.sh');
    expect(workflow).toContain('SITE_API_VERSION_URL');
    expect(workflow).not.toMatch(/^concurrency:/m);
    const deploymentJob = workflow.split('\n  deploy:\n')[1];
    expect(deploymentJob).toBeDefined();
    expect(deploymentJob).toContain('group: static-site-deploy-development');
    expect(deploymentJob).toContain('cancel-in-progress: false');
    expect(workflow).toContain('Record build evidence');
    expect(workflow).toContain('static-site-build-evidence.json');
    expect(workflow).toContain('Record deployment evidence');
    expect(workflow).toContain('static-site-deployment-evidence.json');
  });

  it('keeps the Terraform deploy role separate and resource-scoped', () => {
    const terraformRoot = path.resolve(__dirname, '../../../../packages/infra/terraform/stacks/hashpass-web');
    const main = fs.readFileSync(path.join(terraformRoot, 'main.tf'), 'utf8');
    const variables = fs.readFileSync(path.join(terraformRoot, 'variables.tf'), 'utf8');

    expect(variables).toContain('enable_github_actions_development_static_site_deploy');
    expect(main).toContain('github_actions_development_static_site_deploy_assume_role');
    expect(main).toContain('repo:${var.repository}:environment:development');
    expect(main).toContain('SyncOnlyApprovedStaticSiteBuckets');
    expect(main).toContain('InvalidateOnlyApprovedDistributions');
    expect(main).toContain('DeployOnlyApprovedApiFunctions');
    const deployRoleSection = main.split('resource "aws_iam_role_policy" "github_actions_development_static_site_deploy"')[1];
    expect(deployRoleSection).toBeDefined();
    expect(deployRoleSection).not.toContain('StartStopWebWorker');
  });

  it('keeps AWS build recovery manual after the migration gate', () => {
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const recoveryScript = fs.readFileSync(
      path.join(repositoryRoot, 'packages/tools/scripts/start-web-pipeline-disaster-recovery.sh'),
      'utf8',
    );
    const terraformModule = fs.readFileSync(
      path.join(repositoryRoot, 'packages/infra/terraform/modules/aws_static_site_pipeline/main.tf'),
      'utf8',
    );

    expect(recoveryScript).toContain('--execute');
    expect(recoveryScript).toContain('EXPECTED_AWS_ACCOUNT_ID');
    expect(recoveryScript).toContain('DetectChanges');
    expect(recoveryScript).toContain('start-pipeline-execution');
    expect(recoveryScript).toContain('revisionType=COMMIT_ID');
    expect(recoveryScript).toContain('attempt_nonce=');
    expect(recoveryScript).toContain('/dev/urandom');
    expect(recoveryScript).not.toContain('request_token="hashpass-dr-${ENVIRONMENT}-${COMMIT:0:12}"');
    expect(terraformModule).toContain('source_detect_changes');
    expect(terraformModule).toContain('(var.enable_path_filtered_trigger && var.source_detect_changes)');
    expect(terraformModule).toContain('DetectChanges        = var.source_detect_changes ? "true" : "false"');
  });

  it('provides a read-only GitHub Actions status view', () => {
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const statusScript = fs.readFileSync(
      path.join(repositoryRoot, 'packages/tools/scripts/inspect-github-hosted-static-site-deploy.sh'),
      'utf8',
    );

    expect(statusScript).toContain('actions/workflows');
    expect(statusScript).toContain('/runs?per_page=');
    expect(statusScript).toContain('not registered');
    expect(statusScript).not.toContain('aws ');
  });
});
