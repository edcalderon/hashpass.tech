/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

describe('iOS signing bootstrap', () => {
  const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/mobile-ios-signing-bootstrap.yml');
  const fastfilePath = path.resolve(__dirname, '../../fastlane/Fastfile');

  it('uses a temporary SSH credential to initialize encrypted Match signing assets', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('MATCH_GIT_SSH_PRIVATE_KEY');
    expect(workflow).toContain('MATCH_READONLY: \'false\'');
    expect(workflow).toContain('git@github.com:hashpass-tech/hashpass-ios-signing.git');
    expect(workflow).toContain('bundle exec fastlane ios bootstrap_signing');
  });

  it('creates signing assets without building or uploading an IPA', () => {
    const fastfile = fs.readFileSync(fastfilePath, 'utf8');
    const bootstrapLane = fastfile.slice(fastfile.indexOf("lane :bootstrap_signing"));

    expect(bootstrapLane).toContain('sync_ios_signing(readonly: false)');
    expect(bootstrapLane).not.toContain('build_ios_ipa');
    expect(bootstrapLane).not.toContain('upload_to_testflight');
  });
});
