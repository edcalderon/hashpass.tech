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
    expect(workflow).toContain('cancel-in-progress: true');
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
});
