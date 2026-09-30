/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

describe('iOS signing bootstrap', () => {
  const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/mobile-ios-signing-bootstrap.yml');
  const fastfilePath = path.resolve(__dirname, '../../fastlane/Fastfile');
  const appfilePath = path.resolve(__dirname, '../../fastlane/Appfile');
  const appConfigPath = path.resolve(__dirname, '../../app.json');

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

  it('uses the App Store Connect bundle identifier consistently for signing and the iOS build', () => {
    const fastfile = fs.readFileSync(fastfilePath, 'utf8');
    const appfile = fs.readFileSync(appfilePath, 'utf8');
    const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));

    expect(fastfile).toContain("APP_STORE_BUNDLE_ID = 'tech.hashpass.app'");
    expect(appfile).toContain("package_name('com.hashpass.tech')");
    expect(appConfig.expo.ios.bundleIdentifier).toBe('tech.hashpass.app');
    // Android retains its already-published Google Play identity.
    expect(appConfig.expo.android.package).toBe('com.hashpass.tech');
  });
});
