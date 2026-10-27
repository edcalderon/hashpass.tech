import type { CompanionAuthUser } from '../auth/types';
import type { LocalSmaArchive } from '../sma/types';

export type IdentityKind = 'hashpass-id' | 'email';
export type IdentityStatus = 'verified' | 'confirmed' | 'unconfirmed';

export type AccountIdentity = {
  kind: IdentityKind;
  email: string;
  status: IdentityStatus;
};

export type AccountSummary = {
  displayName: string;
  email: string;
  image?: string;
  initials: string;
  identities: AccountIdentity[];
  archiveId: string | null;
  memoryCount: number;
};

export type AccountSummaryInput = {
  authUser: CompanionAuthUser | null;
  archive: LocalSmaArchive | null;
  /** False while the setup email still has an open "unconfirmed email" notice. */
  setupEmailConfirmed: boolean;
};

export type AccountMenuProps = {
  summary: AccountSummary;
  signedIn: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onExport: () => string;
  onReset: () => void;
};
