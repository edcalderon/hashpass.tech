/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(
  __dirname,
  '../../../../.github/workflows/self-hosted-vps-deploy.yml',
);
const frappeComposePath = path.resolve(
  __dirname,
  '../../../../ops/self-hosted/frappe/compose.yaml',
);
const planeComposePath = path.resolve(
  __dirname,
  '../../../../ops/self-hosted/plane/compose.yaml',
);

describe('self-hosted VPS deployment workflow', () => {
  it('verifies the assumed AWS account against the private target before SSM deployment', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    if (!fs.existsSync(workflowPath)) return;

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const credentialsStart = workflow.indexOf('aws-actions/configure-aws-credentials@v4');
    const identityStart = workflow.indexOf('aws sts get-caller-identity');
    const sendCommandStart = workflow.indexOf('aws ssm send-command');

    expect(credentialsStart).toBeGreaterThan(-1);
    expect(identityStart).toBeGreaterThan(credentialsStart);
    expect(sendCommandStart).toBeGreaterThan(identityStart);

    const identityStepStart = workflow.lastIndexOf('\n      - name:', identityStart);
    const identityStepEnd = workflow.indexOf('\n      - name:', identityStart);
    const identityStep = workflow.slice(
      identityStepStart,
      identityStepEnd === -1 ? workflow.length : identityStepEnd,
    );
    const targetEnvironment = identityStep.match(
      /^\s*([A-Z][A-Z0-9_]*)\s*:\s*\$\{\{\s*vars\.SELF_HOSTED_VPS_AWS_ACCOUNT_ID\s*\}\}\s*$/m,
    );
    const callerIdentity = identityStep.match(
      /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?\$\(aws sts get-caller-identity\s+--query\s+['"]?Account['"]?\s+--output\s+text[^)]*\)["']?/,
    );

    expect(targetEnvironment).not.toBeNull();
    expect(callerIdentity).not.toBeNull();

    const targetVariable = targetEnvironment?.[1] ?? '__missing_target_account__';
    const callerVariable = callerIdentity?.[1] ?? '__missing_caller_account__';
    const shellReference = (name: string) => `\\$\\{?${name}\\}?`;
    expect(identityStep).toMatch(
      new RegExp(
        `(?:${shellReference(callerVariable)}[^\\n]*(?:==|=|!=)[^\\n]*${shellReference(targetVariable)}|` +
          `${shellReference(targetVariable)}[^\\n]*(?:==|=|!=)[^\\n]*${shellReference(callerVariable)})`,
      ),
    );
    expect(workflow).not.toMatch(/\b\d{12}\b/);
    expect(identityStep).not.toContain('vars.AWS_ACCOUNT_ID');
  });

  it('defines a dedicated least-privilege GitHub OIDC role for the production VPS node', () => {
    const terraformRoot = path.resolve(
      __dirname,
      '../../../../packages/infra/terraform/stacks/hashpass-vps-deploy-role',
    );
    const mainPath = path.join(terraformRoot, 'main.tf');
    const variablesPath = path.join(terraformRoot, 'variables.tf');
    const outputsPath = path.join(terraformRoot, 'outputs.tf');

    for (const file of [mainPath, variablesPath, outputsPath]) {
      expect(fs.existsSync(file)).toBe(true);
    }
    if (![mainPath, variablesPath, outputsPath].every(fs.existsSync)) return;

    const main = fs.readFileSync(mainPath, 'utf8');
    const variables = fs.readFileSync(variablesPath, 'utf8');
    const outputs = fs.readFileSync(outputsPath, 'utf8');

    expect(main).toContain('token.actions.githubusercontent.com');
    expect(main).toContain('repo:${var.github_repository}:environment:${var.github_environment}');
    expect(variables).toMatch(
      /variable "github_repository"[\s\S]*?default\s*=\s*"hashpass-tech\/hashpass\.tech"/,
    );
    expect(variables).toMatch(
      /variable "github_environment"[\s\S]*?default\s*=\s*"production"/,
    );
    expect(main).toContain('ssm:SendCommand');
    expect(main).toContain('ssm:GetCommandInvocation');
    expect(main).toContain('managed-instance/${var.ssm_managed_instance_id}');
    expect(main).toContain('document/AWS-RunShellScript');
    expect(main).not.toContain('ssm:*');
    expect(main).not.toMatch(/\bmi-[0-9a-f]{8,}\b/i);
    expect(main).not.toMatch(/\b\d{12}\b/);
    expect(variables).toContain('variable "ssm_managed_instance_id"');
    expect(outputs).toContain('output "github_actions_role_arn"');
  });

  it('deploys from trusted triggers with OIDC, sanitized evidence, health checks, and recoverable alerts', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    if (!fs.existsSync(workflowPath)) return;

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const triggerBlock = workflow.split(/^permissions:/m)[0];

    expect(triggerBlock).toContain('workflow_dispatch:');
    expect(triggerBlock).toMatch(/push:\s*\n\s+branches:\s*\[main\]/);
    expect(triggerBlock).not.toMatch(/pull_request:|schedule:|branches:\s*\[[^\]]*develop/);

    expect(workflow).toMatch(/permissions:[\s\S]*contents:\s*read/);
    expect(workflow).toMatch(/permissions:[\s\S]*id-token:\s*write/);
    expect(workflow).toMatch(/permissions:[\s\S]*issues:\s*write/);
    expect(workflow).toContain('aws-actions/configure-aws-credentials@v4');
    expect(workflow).toMatch(/role-to-assume:\s*\$\{\{/);

    const repositoryVariables = [...workflow.matchAll(/\$\{\{\s*vars\.([A-Z0-9_]+)\s*\}\}/g)]
      .map(match => match[1]);
    expect(repositoryVariables.some(name => /SSM|MANAGED_INSTANCE/.test(name))).toBe(true);
    expect(workflow).toContain('aws ssm send-command');
    expect(workflow).toContain('aws ssm wait command-executed');
    expect(workflow).toContain('aws ssm get-command-invocation');

    expect(workflow).toContain('GITHUB_STEP_SUMMARY');
    expect(workflow).toMatch(/stage/i);
    expect(workflow).toMatch(/status/i);
    expect(workflow).toMatch(/StatusDetails|ResponseCode/);
    expect(workflow).not.toMatch(/StandardOutputContent|StandardErrorContent/);

    for (const service of ['Plane', 'Helpdesk', 'MCP']) {
      expect(workflow).toMatch(new RegExp(`${service}[^\\n]*(health|ready)|(health|ready)[^\\n]*${service}`, 'i'));
    }
    expect(workflow).toMatch(/curl[^\n]*(?:--fail|-f)[^\n]*(?:health|ready)|curl[^\n]*(?:health|ready)[^\n]*(?:--fail|-f)/i);
    const deploymentFinished = workflow.indexOf('aws ssm wait command-executed');
    const firstHealthCheck = workflow.search(/(?:Plane|Helpdesk|MCP)[^\n]*(?:health|ready)/i);
    expect(firstHealthCheck).toBeGreaterThan(deploymentFinished);

    const failureAlertStart = workflow.search(/if:\s*(?:\$\{\{\s*)?failure\(\)(?:\s*\}\})?/);
    const recoveryAlertStart = workflow.search(/if:\s*(?:\$\{\{\s*)?success\(\)(?:\s*\}\})?/);
    expect(failureAlertStart).toBeGreaterThan(-1);
    expect(recoveryAlertStart).toBeGreaterThan(failureAlertStart);

    const failureAlert = workflow.slice(failureAlertStart, recoveryAlertStart);
    const recoveryAlert = workflow.slice(recoveryAlertStart);
    expect(failureAlert).toContain('actions/github-script@v7');
    expect(failureAlert).toContain('issues.listForRepo');
    expect(failureAlert).toContain('issues.create');
    expect(failureAlert).toContain('issues.update');
    expect(recoveryAlert).toContain('actions/github-script@v7');
    expect(recoveryAlert).toContain('issues.listForRepo');
    expect(recoveryAlert).toContain('issues.update');
    expect(recoveryAlert).toMatch(/state:\s*['"]closed['"]/);

    expect(workflow).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    expect(workflow).not.toMatch(/\bmi-[0-9a-f]{8,}\b/i);
    expect(workflow).not.toMatch(/\b\d{12}\b/);
    expect(workflow).not.toMatch(/AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws-access-key-id|aws-secret-access-key/i);
    expect(workflow).not.toMatch(/\b(?:cat|head|tail|sed)\b[^\n]*(?:\.env\b|\/var\/log\/)|\b(?:printenv|journalctl|docker\s+logs)\b/i);
  });

  it('synchronizes tracked operations files with deletion semantics while preserving private runtime files', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    if (!fs.existsSync(workflowPath)) return;

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const dispatchStart = workflow.indexOf('- name: Send exact-revision deployment through SSM');
    const waitStart = workflow.indexOf('- name: Wait for deployment', dispatchStart);
    const dispatchStep = workflow.slice(dispatchStart, waitStart);

    expect(dispatchStep).toMatch(/\brsync\b[^\n]*(?:--delete|--delete-delay)/);
    expect(dispatchStep).toMatch(/--exclude=(?:['"])?\.env(?:['"])?/);
    expect(dispatchStep).toMatch(/--exclude=(?:['"])?\*\.env(?:['"])?/);
    expect(dispatchStep).toMatch(/--exclude=(?:['"])?secrets\/(?:['"])?/);
    expect(dispatchStep).toMatch(/MCP_GATEWAY_BUILD_CONTEXT=.*release_dir/);
  });

  it('passes each Frappe bootstrap script to bash as one command argument', () => {
    const compose = fs.readFileSync(frappeComposePath, 'utf8');

    for (const service of ['frappe-configurator', 'frappe-create-site']) {
      const serviceStart = compose.indexOf(`  ${service}:`);
      const nextService = compose.indexOf('\n  frappe-', serviceStart + 3);
      const block = compose.slice(serviceStart, nextService === -1 ? compose.length : nextService);

      expect(serviceStart).toBeGreaterThan(-1);
      expect(block).toContain('entrypoint: ["bash", "-c"]');
      expect(block).toMatch(/command:\s*\n\s+- \|-\s*\n/);
    }
  });

  it('keeps local MinIO optional when production uses external object storage', () => {
    const compose = fs.readFileSync(planeComposePath, 'utf8');
    const profileMatches = compose.match(/profiles:\s*\[local-object-storage\]/g) ?? [];

    expect(profileMatches).toHaveLength(2);
    expect(compose).toMatch(
      /plane-minio-init:\s*\n\s+condition:\s*service_completed_successfully\s*\n\s+required:\s*false/,
    );
  });
});
