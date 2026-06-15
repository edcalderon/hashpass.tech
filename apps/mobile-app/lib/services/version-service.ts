import { CURRENT_VERSION, VERSION_HISTORY, VersionInfo } from '../../config/version';
import { getRuntimeBranch, getRuntimeVersionInfo } from '../../config/runtime-version';
import gitInfo from '../../config/git-info.json';

// Re-export VersionInfo for backward compatibility
export type { VersionInfo };

class VersionService {
  private versionsMap: Map<string, VersionInfo>;

  constructor() {
    // Build map from VERSION_HISTORY (source of truth: version.ts)
    this.versionsMap = new Map(
      Object.entries(VERSION_HISTORY).map(([version, info]) => [version, info])
    );
  }

  public getCurrentVersion(): VersionInfo {
    const currentVersion = getRuntimeVersionInfo(CURRENT_VERSION);

    const historyVersion = this.versionsMap.get(currentVersion.version);
    if (historyVersion) {
      return {
        ...historyVersion,
        version: currentVersion.version,
        environment: currentVersion.environment,
      };
    }

    return {
      ...currentVersion,
    };
  }

  public getVersionInfo(version: string): VersionInfo | undefined {
    return this.versionsMap.get(version);
  }

  public getVersionHistory(): VersionInfo[] {
    // Get all versions from VERSION_HISTORY (source of truth: version.ts)
    const versions = Array.from(this.versionsMap.values());
    
    // Sort by version number (newest first)
    return versions.sort((a, b) => {
      const aParts = a.version.split('.').map(Number);
      const bParts = b.version.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (bParts[i] !== aParts[i]) return bParts[i] - aParts[i];
      }
      return 0;
    });
  }

  public getVersionBadgeInfo(releaseType: VersionInfo['releaseType']): { text: string; color: string } {
    const colorMap: Record<string, string> = {
      stable: '#34A853',
      beta: '#007AFF',
      rc: '#FF9500',
      alpha: '#FF3B30',
    };

    return {
      text: releaseType.toUpperCase(),
      color: colorMap[releaseType] || '#8E8E93',
    };
  }

  public getBuildInfo() {
    const gitCommit = (gitInfo as any).gitCommit || process.env.GIT_COMMIT || 'unknown';
    const gitCommitFull = (gitInfo as any).gitCommitFull || gitCommit;
    const gitBranch = getRuntimeBranch();
    const gitRepoUrl = (gitInfo as any).gitRepoUrl || 'https://github.com/hashpass-tech/hashpass.tech';
    
    return {
      buildId: `build-${this.getCurrentVersion().buildNumber}`,
      buildTime: new Date().toISOString(),
      gitCommit: gitCommit,
      gitCommitFull: gitCommitFull,
      gitBranch: gitBranch,
      gitRepoUrl: gitRepoUrl,
      gitCommitUrl: `${gitRepoUrl}/commit/${gitCommitFull}`,
      buildEnvironment: process.env.NODE_ENV || 'development',
      buildMachine: process.env.HOSTNAME || 'unknown',
    };
  }
}

export const versionService = new VersionService();
