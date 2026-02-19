// Version Tracking System
// Tracks version changes, build information, and deployment status

import { VersionInfo, VERSION_HISTORY, CURRENT_VERSION } from '../config/version';
import packageJson from '../package.json';

export interface BuildInfo {
  buildId: string;
  buildTime: string;
  gitCommit: string;
  gitBranch: string;
  buildEnvironment: string;
  buildMachine: string;
}

export interface DeploymentInfo {
  deploymentId: string;
  deploymentTime: string;
  environment: string;
  version: string;
  status: 'success' | 'failed' | 'in-progress';
  rollbackVersion?: string;
}

export interface VersionMetrics {
  version: string;
  installCount: number;
  crashCount: number;
  errorCount: number;
  performanceScore: number;
  userSatisfaction: number;
  lastUpdated: string;
}

class VersionTracker {
  private static instance: VersionTracker;
  private buildInfo: BuildInfo | null = null;
  private deploymentInfo: DeploymentInfo | null = null;
  private metrics: VersionMetrics | null = null;

  private constructor() {
    this.initializeBuildInfo();
  }

  public static getInstance(): VersionTracker {
    if (!VersionTracker.instance) {
      VersionTracker.instance = new VersionTracker();
    }
    return VersionTracker.instance;
  }

  private initializeBuildInfo(): void {
    this.buildInfo = {
      buildId: this.generateBuildId(),
      buildTime: new Date().toISOString(),
      gitCommit: this.getGitCommit() || 'unknown',
      gitBranch: this.getGitBranch() || 'main',
      buildEnvironment: process.env.NODE_ENV || 'development',
      buildMachine: process.env.HOSTNAME || 'unknown'
    };
  }

  private generateBuildId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `build-${timestamp}-${random}`;
  }

  private getGitCommit(): string | null {
    try {
      // In a real implementation, you would read from .git/HEAD
      return process.env.GIT_COMMIT || null;
    } catch {
      return null;
    }
  }

  private getGitBranch(): string | null {
    try {
      // In a real implementation, you would read from .git/HEAD
      return process.env.GIT_BRANCH || null;
    } catch {
      return null;
    }
  }

  public getCurrentVersion(): VersionInfo {
    // Get the current version from package.json
    const currentVersion = packageJson.version;
    
    // If we have this version in history, return it
    if (VERSION_HISTORY[currentVersion]) {
      return VERSION_HISTORY[currentVersion];
    }
    
    // Otherwise, return the CURRENT_VERSION with updated version number
    return {
      ...CURRENT_VERSION,
      version: currentVersion,
      // Update the build number to current timestamp if not set
      buildNumber: CURRENT_VERSION.buildNumber || Date.now(),
      // Update the release date to today if not set
      releaseDate: CURRENT_VERSION.releaseDate || new Date().toISOString().split('T')[0]
    };
  }

  public getVersionHistory(): VersionInfo[] {
    // Get all versions from history
    const history = Object.values(VERSION_HISTORY);
    
    // Add current version if not in history
    const currentVersion = this.getCurrentVersion();
    if (!history.some(v => v.version === currentVersion.version)) {
      history.push(currentVersion);
    }
    
    // Sort by build number in descending order (newest first)
    return history.sort((a, b) => b.buildNumber - a.buildNumber);
  }

  public getBuildInfo(): BuildInfo | null {
    return this.buildInfo;
  }

  public getDeploymentInfo(): DeploymentInfo | null {
    return this.deploymentInfo;
  }

  public setDeploymentInfo(info: DeploymentInfo): void {
    this.deploymentInfo = info;
  }

  public getMetrics(): VersionMetrics | null {
    return this.metrics;
  }

  public setMetrics(metrics: VersionMetrics): void {
    this.metrics = metrics;
  }

  public getVersionSummary(): {
    version: VersionInfo;
    build: BuildInfo | null;
    deployment: DeploymentInfo | null;
    metrics: VersionMetrics | null;
  } {
    return {
      version: this.getCurrentVersion(),
      build: this.getBuildInfo(),
      deployment: this.getDeploymentInfo(),
      metrics: this.getMetrics()
    };
  }

  public isUpdateAvailable(): boolean {
    // In a real implementation, you would check against a remote version API
    return false;
  }

  public getUpdateInfo(): { available: boolean; latestVersion?: string; updateUrl?: string } {
    return {
      available: this.isUpdateAvailable(),
      latestVersion: undefined,
      updateUrl: undefined
    };
  }

  public logVersionInfo(): void {
    const summary = this.getVersionSummary();
    console.log('🚀 Version Information:', {
      version: summary.version.version,
      build: summary.build?.buildId,
      environment: summary.version.environment,
      releaseType: summary.version.releaseType
    });
  }

  public getVersionDisplayText(): string {
    const version = this.getCurrentVersion();
    const build = this.getBuildInfo();
    
    let displayText = `v${version.version}`;
    
    if (version.releaseType !== 'stable') {
      displayText += ` (${version.releaseType.toUpperCase()})`;
    }
    
    if (build) {
      displayText += ` • Build ${build.buildId.split('-')[1]}`;
    }
    
    return displayText;
  }

  public getVersionBadgeInfo(): { text: string; color: string } {
    const version = this.getCurrentVersion();
    
    const badgeText = version.releaseType.toUpperCase();
    let badgeColor = '#8E8E93';
    
    switch (version.releaseType) {
      case 'stable':
        badgeColor = '#34A853';
        break;
      case 'rc':
        badgeColor = '#FF9500';
        break;
      case 'beta':
        badgeColor = '#007AFF';
        break;
      case 'alpha':
        badgeColor = '#FF3B30';
        break;
    }
    
    return { text: badgeText, color: badgeColor };
  }
}

// Export singleton instance
export const versionTracker = VersionTracker.getInstance();

// Utility functions
export const getVersionDisplayText = (): string => {
  return versionTracker.getVersionDisplayText();
};

export const getVersionBadgeInfo = (): { text: string; color: string } => {
  return versionTracker.getVersionBadgeInfo();
};

export const logVersionInfo = (): void => {
  versionTracker.logVersionInfo();
};

export default versionTracker;
