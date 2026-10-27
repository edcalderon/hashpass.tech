import type { AccountIdentity, AccountSummary, AccountSummaryInput } from './types';

export const initialsFor = (name: string | undefined, email: string): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  const source = words[0] ?? email.split('@')[0] ?? '';
  return (source.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '?').toUpperCase();
};

/** The account is "connected" when there is a HASHPASS ID session or a setup email on this device. */
export const isConnected = ({ authUser, archive }: Pick<AccountSummaryInput, 'authUser' | 'archive'>): boolean =>
  authUser !== null || archive !== null;

export function buildAccountSummary({ authUser, archive, setupEmailConfirmed }: AccountSummaryInput): AccountSummary | null {
  if (!isConnected({ authUser, archive })) return null;
  const identities: AccountIdentity[] = [];
  if (authUser) identities.push({ kind: 'hashpass-id', email: authUser.email, status: 'verified' });
  if (archive && archive.ownerEmail.toLowerCase() !== authUser?.email.toLowerCase()) {
    identities.push({ kind: 'email', email: archive.ownerEmail, status: setupEmailConfirmed ? 'confirmed' : 'unconfirmed' });
  }
  const email = authUser?.email ?? archive?.ownerEmail ?? '';
  return {
    displayName: authUser?.name || email.split('@')[0] || email,
    email,
    ...(authUser?.image ? { image: authUser.image } : {}),
    initials: initialsFor(authUser?.name, email),
    identities,
    archiveId: archive?.manifest.archiveId ?? null,
    memoryCount: archive?.records.length ?? 0,
  };
}

/** The setup email never needs its own confirmation when the signed-in HASHPASS ID already proves it. */
export const inboxOwnerEmail = (setupEmail: string | null, authEmail: string | null): string | null =>
  setupEmail && authEmail && setupEmail.toLowerCase() === authEmail.toLowerCase() ? null : setupEmail;

export function downloadArchive(serialized: string) {
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'companion-sma-0.1.json';
  link.click();
  URL.revokeObjectURL(url);
}
