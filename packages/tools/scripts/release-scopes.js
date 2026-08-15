const RELEASE_SCOPE_DEFINITIONS = [
  ['Club web', (file) => file.startsWith('apps/web-app/')],
  ['Mobile app', (file) => file.startsWith('apps/mobile-app/') || file === 'app.json'],
  ['QR links API', (file) => file.startsWith('packages/hashpass-links-api/') || file.startsWith('packages/backend/src/qr-links/')],
  ['SDK', (file) => file.startsWith('packages/sdk/')],
  ['Shared UI', (file) => file.startsWith('packages/ui/')],
  ['Auth', (file) => file.startsWith('packages/auth/') || file.startsWith('packages/hashpass-auth/')],
  ['Database migrations', (file) => file.startsWith('db/migrations/')],
  ['Infrastructure', (file) => file.startsWith('packages/infra/')],
  ['Documentation', (file) => file === 'README.md' || file === 'CLAUDE.md' || file.startsWith('apps/docs/')],
  ['Release tooling', (file) => file.startsWith('packages/tools/') || file.startsWith('.github/workflows/') || file.startsWith('.github/scripts/')],
];

const GENERATED_RELEASE_ARTIFACTS = new Set([
  'CHANGELOG.md',
  'README.md',
  'package.json',
  'app.json',
  'apps/mobile-app/app.json',
  'apps/mobile-app/package.json',
  'apps/mobile-app/public/sw.js',
  'apps/mobile-app/config/git-info.json',
  'apps/mobile-app/config/version.development.json',
  'apps/mobile-app/config/version.production.json',
  'apps/mobile-app/config/version.ts',
  'apps/mobile-app/config/versions.json',
  'packages/infra/lambda/package.json',
]);

function normalizeFiles(files) {
  return Array.isArray(files)
    ? files.map((file) => String(file || '').trim()).filter(Boolean)
    : [];
}

function classifyAffectedReleaseScopes(files) {
  const normalizedFiles = normalizeFiles(files).filter((file) => !GENERATED_RELEASE_ARTIFACTS.has(file));
  return RELEASE_SCOPE_DEFINITIONS
    .filter(([, matches]) => normalizedFiles.some((file) => matches(file)))
    .map(([label]) => label);
}

function formatAffectedReleaseScopes(baseRelease, files) {
  const normalizedBase = String(baseRelease || '').trim().replace(/^v/, '');
  const scopes = classifyAffectedReleaseScopes(files);
  const releaseScope = [
    '### Release scope',
    normalizedBase
      ? `- Compared with: \`v${normalizedBase}\` (the previous global release tag)`
      : '- Compared with: previous global release tag unavailable',
  ];

  const affectedProducts = [
    '### Affected products & packages',
    ...(scopes.length > 0
      ? scopes.map((scope) => `- ${scope}`)
      : ['- Shared repository changes only']),
  ];

  return [...releaseScope, '', ...affectedProducts].join('\n');
}

module.exports = {
  classifyAffectedReleaseScopes,
  formatAffectedReleaseScopes,
};
