import packageJson from '../package.json';
import gitInfo from './git-info.json';
import versionsJson from './versions.json';

export interface VersionInfo {
  version: string;
  buildNumber: number;
  releaseDate: string;
  releaseType: 'stable' | 'beta' | 'rc' | 'alpha';
  environment: 'development' | 'staging' | 'production';
  features: string[];
  bugfixes: string[];
  breakingChanges: string[];
  notes: string;
}

export interface VersionHistory {
  [version: string]: VersionInfo;
}

type VersionsJson = {
  currentVersion?: Partial<VersionInfo> & { version?: string };
  versions?: Array<Partial<VersionInfo> & { version?: string }>;
};

function normalizeVersionInfo(
  info: Partial<VersionInfo> & { version?: string } = {}
): VersionInfo {
  const version = info.version || packageJson.version;

  return {
    version,
    buildNumber: info.buildNumber || 0,
    releaseDate: info.releaseDate || new Date().toISOString().slice(0, 10),
    releaseType: info.releaseType || 'stable',
    environment:
      info.environment || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    features: info.features || [],
    bugfixes: info.bugfixes || [],
    breakingChanges: info.breakingChanges || [],
    notes: info.notes || `Version ${version} release`,
  };
}

const typedVersionsJson = versionsJson as VersionsJson;
const typedGitInfo = gitInfo as {
  gitCommit?: string;
  gitCommitFull?: string;
  gitBranch?: string;
  gitRepoUrl?: string;
};
const runtimeEnvironment: VersionInfo['environment'] =
  process.env.NODE_ENV === 'production' ? 'production' : 'development';

export const CURRENT_VERSION: VersionInfo = {
  ...normalizeVersionInfo(typedVersionsJson.currentVersion || { version: packageJson.version }),
  environment: runtimeEnvironment,
};

export const VERSION_HISTORY: VersionHistory = Object.fromEntries(
  (typedVersionsJson.versions || []).map((entry) => {
    const normalized = normalizeVersionInfo(entry);
    return [normalized.version, normalized];
  })
);

export const BUILD_INFO = {
  gitCommit: typedGitInfo.gitCommit || 'unknown',
  gitCommitFull: typedGitInfo.gitCommitFull || typedGitInfo.gitCommit || 'unknown',
  gitBranch: typedGitInfo.gitBranch || 'main',
  gitRepoUrl: typedGitInfo.gitRepoUrl || 'https://github.com/hashpass-tech/hashpass.tech',
};

export function getClubVersionLabel(version: Pick<VersionInfo, 'version'> = CURRENT_VERSION): string {
  return `v${version.version}`;
}
