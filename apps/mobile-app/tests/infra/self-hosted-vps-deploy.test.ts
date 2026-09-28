/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(
  __dirname,
  '../../../../.github/workflows/self-hosted-vps-deploy.yml',
);

describe('self-hosted VPS deployment workflow', () => {
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
});
