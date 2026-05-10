import gitInfo from './git-info.json';
import productionVersion from '../../../version.production.json';
import developmentVersion from '../../../version.development.json';
import type { VersionInfo } from './version';

type RuntimeBranch = 'production' | 'development';

const PRODUCTION_BRANCHES = new Set(['main', 'master', 'production']);

function normalizeBranch(branch?: string | null): string {
  return (branch || '')
    .trim()
    .toLowerCase()
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '');
}

export function getRuntimeBranch(): string {
  return (
    (typeof process !== 'undefined' && process.env.GIT_BRANCH) ||
    (gitInfo as { gitBranch?: string }).gitBranch ||
    (typeof process !== 'undefined' && process.env.VERCEL_GIT_COMMIT_REF) ||
    'main'
  );
}

export function getRuntimeVersionChannel(branch: string = getRuntimeBranch()): RuntimeBranch {
  return PRODUCTION_BRANCHES.has(normalizeBranch(branch)) ? 'production' : 'development';
}

export function getRuntimeEnvironment(branch: string = getRuntimeBranch()): VersionInfo['environment'] {
  return getRuntimeVersionChannel(branch) === 'production' ? 'production' : 'development';
}

export function getRuntimeVersion(branch: string = getRuntimeBranch()): string {
  return getRuntimeVersionChannel(branch) === 'production'
    ? (productionVersion as { version?: string }).version || 'unknown'
    : (developmentVersion as { version?: string }).version || 'unknown';
}

export function getRuntimeVersionInfo(baseVersion: VersionInfo, branch: string = getRuntimeBranch()): VersionInfo {
  return {
    ...baseVersion,
    version: getRuntimeVersion(branch),
    environment: getRuntimeEnvironment(branch),
  };
}

function stripVersionPrefix(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }

  if (leftNumeric) return -1;
  if (rightNumeric) return 1;

  return left.localeCompare(right);
}

function comparePrerelease(left: string[], right: string[]): number {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const result = compareIdentifier(leftPart, rightPart);
    if (result !== 0) return result;
  }

  return 0;
}

export function compareAppVersions(leftVersion: string, rightVersion: string): number {
  const [leftCore, leftPrerelease = ''] = stripVersionPrefix(leftVersion).split('-', 2);
  const [rightCore, rightPrerelease = ''] = stripVersionPrefix(rightVersion).split('-', 2);

  const leftParts = leftCore.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = rightCore.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }

  const leftHasPrerelease = leftPrerelease.length > 0;
  const rightHasPrerelease = rightPrerelease.length > 0;

  if (!leftHasPrerelease && !rightHasPrerelease) {
    return 0;
  }

  if (!leftHasPrerelease) {
    return 1;
  }

  if (!rightHasPrerelease) {
    return -1;
  }

  return comparePrerelease(leftPrerelease.split('.'), rightPrerelease.split('.'));
}
