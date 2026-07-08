const {
  buildPromotionPullRequestBody,
  buildPromotionFileHighlights,
  formatPromotionSummarySections,
  incrementPatchVersion,
  resolvePromotionVersion,
} = require('./release.js');

describe('release promotion PR body', () => {
  const sampleSummary = formatPromotionSummarySections({
    notes: 'Promote develop release prep into main, including auth/OAuth fixes and coverage updates.',
    features: ['add Codecov coverage tracking'],
    bugfixes: ['allow pnpm metro files in android bundle', 'hide google icon during oauth redirect'],
    breakingChanges: [],
  });

  const sampleHighlights = buildPromotionFileHighlights([
    'CLAUDE.md',
    'packages/tools/scripts/README.md',
    'apps/docs/docs/reference/release/RELEASE_WORKFLOW.md',
    'packages/tools/scripts/release.js',
    'packages/tools/scripts/release.test.js',
    'packages/tools/scripts/update-readme.mjs',
    'packages/tools/scripts/check-readme-sync.mjs',
    'apps/mobile-app/config/version.ts',
  ]);

  const sampleChangeSummary = [
    sampleSummary,
    sampleHighlights,
    '<details>',
    '<summary>Changed files (3)</summary>',
    '',
    '- `apps/mobile-app/app/(shared)/auth.tsx`',
    '- `apps/mobile-app/app/_layout.tsx`',
    '- `packages/tools/scripts/release.js`',
    '',
    '</details>',
  ].join('\n');

  it('increments patch versions correctly', () => {
    expect(incrementPatchVersion('1.8.169')).toBe('1.8.170');
    expect(incrementPatchVersion('v1.8.169')).toBe('1.8.170');
  });

  it('resolves the next promotion version when the current version matches the latest release', () => {
    expect(resolvePromotionVersion('1.8.169', '1.8.169')).toBe('1.8.170');
    expect(resolvePromotionVersion('1.8.170', '1.8.169')).toBe('1.8.170');
  });

  it('builds a changelog-style promotion body from the actual promotion delta', () => {
    const body = buildPromotionPullRequestBody(
      '1.8.170',
      'd19cad7',
      sampleChangeSummary,
      '1.8.169',
    );

    expect(body).toContain('Promote the current develop release prep for v1.8.170 into main.');
    expect(body).toContain('### Changes since v1.8.169');
    expect(body).toContain('#### Overview');
    expect(body).toContain('#### Features');
    expect(body).toContain('#### Bug Fixes');
    expect(body).toContain('#### Implementation changes');
    expect(body).toContain('Updated release docs and CLAUDE guidance');
    expect(body).toContain('Reworked the promotion PR generator');
    expect(body).toContain('Kept versioning, changelog, and README sync aligned');
    expect(body).toContain('<details>');
    expect(body).toContain('apps/mobile-app/app/(shared)/auth.tsx');
    expect(body).toContain('### Release metadata');
    expect(body).toContain('- Release version: v1.8.170');
    expect(body).toContain('- Base release: v1.8.169');
    expect(body).toContain('- Release commit: d19cad7');
    expect(body).toContain('- Source branch: develop');
  });

  it('omits generic version-only notes from the visible summary', () => {
    expect(
      formatPromotionSummarySections({
        notes: 'Version 1.8.173 release',
        features: [],
        bugfixes: [],
        breakingChanges: [],
      }),
    ).toBe('');
  });

  it('summarizes docs and release tooling changes from file paths', () => {
    const summary = buildPromotionFileHighlights([
      'CLAUDE.md',
      'packages/tools/scripts/release.js',
      'packages/tools/scripts/check-readme-sync.mjs',
      'apps/docs/docs/reference/release/RELEASE_WORKFLOW.md',
    ]);

    expect(summary).toContain('#### Implementation changes');
    expect(summary).toContain('release docs and CLAUDE guidance');
    expect(summary).toContain('promotion PR generator');
    expect(summary).toContain('README sync aligned');
  });
});
