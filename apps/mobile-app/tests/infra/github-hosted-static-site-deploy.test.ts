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
    expect(workflow).toContain('target:');
    expect(workflow).toContain("default: 'development'");
    expect(workflow).toContain('deploy:');
    expect(workflow).toContain('default: false');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain('Build the static site');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain("if: inputs.deploy == true");
  });

  it('requires a protected environment and uses the existing deploy scripts', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('environment: ${{ inputs.target }}');
    expect(workflow).toContain('aws-actions/configure-aws-credentials@v4');
    expect(workflow).toContain('packages/tools/scripts/build-static-site.sh');
    expect(workflow).toContain('packages/tools/scripts/deploy-static-site.sh');
    expect(workflow).toContain('SITE_API_VERSION_URL');
    expect(workflow).toContain('cancel-in-progress: true');
  });
});
