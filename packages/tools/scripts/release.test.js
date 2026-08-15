const {
  classifyAffectedReleaseScopes,
  formatAffectedReleaseScopes,
  buildPromotionPullRequestBody,
  buildPromotionFileHighlights,
  extractVersionArray,
  formatPromotionSummarySections,
  incrementPatchVersion,
  resolvePromotionVersion,
} = require('./release.js');
const { isReadmeGuardBypassed } = require('./readme-guard.js');

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

  it('labels the specific products and packages affected by the release range', () => {
    const scopes = classifyAffectedReleaseScopes([
      'apps/web-app/app/panel/qr/page.tsx',
      'apps/mobile-app/app/index.tsx',
      'packages/hashpass-links-api/src/routes/qr-links.ts',
      'packages/sdk/src/qr-links/client.ts',
      'db/migrations/V081__qr_link_custom_slugs.sql',
      'packages/tools/scripts/release.js',
    ]);

    expect(scopes).toEqual([
      'Club web',
      'Mobile app',
      'QR links API',
      'SDK',
      'Database migrations',
      'Release tooling',
    ]);
  });

  it('renders a release scope block with the previous global tag', () => {
    const summary = formatAffectedReleaseScopes('v1.9.0', [
      'apps/web-app/app/page.tsx',
      'packages/hashpass-links-api/src/routes/qr-links.ts',
    ]);

    expect(summary).toContain('### Release scope');
    expect(summary).toContain('Compared with: `v1.9.0`');
    expect(summary).toContain('### Affected products & packages');
    expect(summary).toContain('- Club web');
    expect(summary).toContain('- QR links API');
  });

  it('does not label an app solely because the release updates generated version files', () => {
    const scopes = classifyAffectedReleaseScopes([
      'apps/mobile-app/config/version.ts',
      'apps/mobile-app/config/versions.json',
      'apps/mobile-app/package.json',
      'app.json',
    ]);

    expect(scopes).toEqual([]);
  });

  it('only bypasses the README guard with the explicit emergency switch', () => {
    expect(isReadmeGuardBypassed([], {})).toBe(false);
    expect(isReadmeGuardBypassed(['--allow-stale'], {})).toBe(true);
    expect(isReadmeGuardBypassed([], { HASHPASS_SKIP_README_GUARD: '1' })).toBe(true);
    expect(isReadmeGuardBypassed([], { HASHPASS_SKIP_README_GUARD: 'true' })).toBe(false);
  });

  it('parses version.ts arrays with inline commas and escaped quotes', () => {
    const block = String.raw`
  features: ['Preserve city, country labels', "Render escaped \"double\" quotes"],
  bugfixes: [
    // The comma below belongs to the item, not the parser.
    'Keep alpha, beta, and gamma together',
    'Keep literal ], text inside a release bullet',
    'Preserve escaped \'single\' quotes'
  ],
  breakingChanges: [],
`;

    expect(extractVersionArray(block, 'features')).toEqual([
      'Preserve city, country labels',
      'Render escaped "double" quotes',
    ]);
    expect(extractVersionArray(block, 'bugfixes')).toEqual([
      'Keep alpha, beta, and gamma together',
      'Keep literal ], text inside a release bullet',
      "Preserve escaped 'single' quotes",
    ]);
    expect(extractVersionArray(block, 'breakingChanges')).toEqual([]);
  });
});
