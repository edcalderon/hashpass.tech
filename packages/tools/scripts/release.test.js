const {
  buildPromotionPullRequestBody,
  incrementPatchVersion,
  resolvePromotionVersion,
} = require('./release.js');

describe('release promotion PR body', () => {
  const sampleChangeSummary = [
    '- `apps/mobile-app/app/(shared)/auth.tsx`',
    '- `apps/mobile-app/app/_layout.tsx`',
    '- `packages/tools/scripts/release.js`',
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
    expect(body).toContain('apps/mobile-app/app/(shared)/auth.tsx');
    expect(body).toContain('packages/tools/scripts/release.js');
    expect(body).toContain('### Release metadata');
    expect(body).toContain('- Release version: v1.8.170');
    expect(body).toContain('- Base release: v1.8.169');
    expect(body).toContain('- Release commit: d19cad7');
    expect(body).toContain('- Source branch: develop');
  });
});
