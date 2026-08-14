const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');

test('native releases default to GitHub-hosted runners instead of starting EC2', () => {
  const releaseWorkflow = fs.readFileSync(
    path.join(root, '.github/workflows/mobile-android-release.yml'),
    'utf8',
  );
  const tagWorkflow = fs.readFileSync(
    path.join(root, '.github/workflows/mobile-release-on-tag.yml'),
    'utf8',
  );
  const runnerVariables = fs.readFileSync(
    path.join(root, 'packages/infra/terraform/stacks/mobile-release-target/variables.tf'),
    'utf8',
  );

  assert.match(releaseWorkflow, /runner:\n[\s\S]*?default: github-hosted/);
  assert.match(tagWorkflow, /--field runner=github-hosted/);
  assert.doesNotMatch(tagWorkflow, /--field runner=aws-ec2/);
  assert.match(
    releaseWorkflow,
    /runner=aws-ec2 requires AWS_RUNNER_ROLE_ARN and EC2_RUNNER_INSTANCE_ID/,
  );
  assert.match(runnerVariables, /variable "instance_count" \{[\s\S]*?default\s*=\s*0/);
});
