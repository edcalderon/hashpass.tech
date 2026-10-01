/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/mobile-release-on-tag.yml');

describe('mobile release tag workflow', () => {
  it('dispatches the iOS TestFlight workflow only after iOS release setup is enabled', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('trigger-ios-release:');
    expect(workflow).toContain("vars.IOS_RELEASE_ENABLED == 'true'");
    expect(workflow).toContain('needs_ios_release: ${{ steps.guard.outputs.needs_ios_release }}');
    expect(workflow).toContain("needs.detect-native-change.outputs.needs_ios_release == 'true'");
    expect(workflow).toContain('gh workflow run mobile-ios-release.yml');
  });

  it('requires private Match repository credentials without exposing them in logs', () => {
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../../.github/workflows/mobile-ios-release.yml'),
      'utf8',
    );

    expect(workflow).toContain('MATCH_GIT_BASIC_AUTHORIZATION');
    expect(workflow).toContain('secrets.MATCH_GIT_BASIC_AUTHORIZATION');
    expect(workflow).toContain('Missing required GitHub Actions secret: $name');
  });

  it('supplies and materializes the production public runtime config before bundling', () => {
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../../.github/workflows/mobile-ios-release.yml'),
      'utf8',
    );

    expect(workflow).toContain('EAS_PROJECT_ID: ${{ vars.EAS_PROJECT_ID }}');
    expect(workflow).toContain('EXPO_OWNER: hashpasss-team');
    expect(workflow).toContain('EXPO_PUBLIC_SUPABASE_PROFILE: core-production');
    expect(workflow).toContain('EXPO_PUBLIC_SUPABASE_URL: ${{ vars.EXPO_PUBLIC_SUPABASE_URL_PROD }}');
    expect(workflow).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD }}');
    expect(workflow).toContain('EXPO_PUBLIC_LINKS_API_BASE_URL: ${{ vars.EXPO_PUBLIC_LINKS_API_BASE_URL_PROD }}');
    expect(workflow).toContain('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: ${{ vars.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID }}');
    expect(workflow).toContain('- name: Write mobile app env');
    expect(workflow).toContain("printf 'EXPO_PUBLIC_SUPABASE_URL=%s\\n'");
  });
});
