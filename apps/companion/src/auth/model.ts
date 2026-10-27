import type { CompanionAuthSessionResult, CompanionAuthUser } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function mapAuthSession(data: unknown): CompanionAuthUser | null {
  if (!isRecord(data)) return null;
  const user = (data as CompanionAuthSessionResult).user;
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') return null;

  return {
    id: user.id,
    email: user.email,
    ...(typeof user.name === 'string' && user.name ? { name: user.name } : {}),
    ...(typeof user.image === 'string' && user.image ? { image: user.image } : {}),
  };
}

export function describeAuthError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === 'string' && error.message) return error.message;
  return 'We could not verify your HASHPASS session. Please try again.';
}
