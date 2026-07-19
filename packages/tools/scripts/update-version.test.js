const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPath = path.join(__dirname, 'update-version.mjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-version-test-'));

  writeFile(
    path.join(root, 'packages/tools/scripts/update-version.mjs'),
    fs.readFileSync(scriptPath, 'utf8'),
  );
  writeJson(path.join(root, 'package.json'), {
    name: 'hashpass-version-fixture',
    version: '1.0.0',
    scripts: {
      'update-readme': 'node -e "process.exit(0)"',
    },
  });
  writeJson(path.join(root, 'apps/mobile-app/package.json'), { version: '1.0.0' });
  writeJson(path.join(root, 'packages/infra/lambda/package.json'), { version: '1.0.0' });
  writeJson(path.join(root, 'apps/mobile-app/config/version.production.json'), { version: '1.0.0' });
  writeJson(path.join(root, 'apps/mobile-app/config/version.development.json'), { version: '1.0.0' });
  writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n');
  writeFile(
    path.join(root, 'apps/mobile-app/config/version.ts'),
    `import packageJson from '../../package.json';

export interface VersionInfo {
  version: string;
  buildNumber: number;
  releaseDate: string;
  releaseType: string;
  environment: string;
  features: string[];
  bugfixes: string[];
  breakingChanges: string[];
  notes: string;
}

export type VersionHistory = Record<string, VersionInfo>;

export const CURRENT_VERSION: VersionInfo = {
  version: packageJson.version,
  buildNumber: 202601010000,
  releaseDate: '2026-01-01',
  releaseType: 'beta',
  environment: 'development',
  features: [
    'Existing feature'
  ],
  bugfixes: [
    'Existing fix'
  ],
  breakingChanges: [],
  notes: 'Existing release'
};

export const VERSION_HISTORY: VersionHistory = {
  '1.0.0': {
    version: '1.0.0',
    buildNumber: 202601010000,
    releaseDate: '2026-01-01',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Preserve city, country labels',
      'Preserve escaped \\'single\\' quotes'
    ],
    bugfixes: [
      'Keep alpha, beta, and gamma together'
    ],
    breakingChanges: [],
    notes: 'Existing release'
  }
};
`,
  );

  return root;
}

describe('update-version', () => {
  it('preserves commas inside quoted version.ts array items when generating versions.json', () => {
    const root = createFixtureRepo();

    try {
      execFileSync('node', ['packages/tools/scripts/update-version.mjs', '1.0.1', '--skip-git-info'], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          HUSKY: '0',
        },
      });

      const versions = JSON.parse(
        fs.readFileSync(path.join(root, 'apps/mobile-app/config/versions.json'), 'utf8'),
      );
      const previousVersion = versions.versions.find((entry) => entry.version === '1.0.0');

      expect(previousVersion.features).toEqual([
        'Preserve city, country labels',
        "Preserve escaped 'single' quotes",
      ]);
      expect(previousVersion.bugfixes).toEqual(['Keep alpha, beta, and gamma together']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
