/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/mobile-release-on-tag.yml');

describe('mobile release tag workflow', () => {
  it('dispatches the iOS TestFlight workflow only after iOS release setup is enabled', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('trigger-ios-release:');
    expect(workflow).toContain("vars.IOS_RELEASE_ENABLED == 'true'");
    expect(workflow).toContain('gh workflow run mobile-ios-release.yml');
  });
});
