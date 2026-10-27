export type SmaMemoryType = 'fact' | 'preference' | 'episode' | 'observation' | 'goal' | 'skill' | 'correction' | 'commitment' | 'relationship' | 'reflection';
export type SmaEpistemicStatus = 'observed' | 'reported' | 'inferred' | 'instructed' | 'approved' | 'disputed' | 'unknown';
export type SmaVisibility = 'public' | 'internal' | 'private' | 'sensitive' | 'secret';
export type SmaLifecycleStatus = 'active' | 'superseded' | 'revoked' | 'expired' | 'tombstoned' | 'cryptographically-erased';

export type SmaMemoryInput = {
  type: SmaMemoryType;
  content: string;
  epistemicStatus: SmaEpistemicStatus;
  scope: string;
  sensitivity: SmaVisibility;
  confidence?: number;
  provenanceMethod?: string;
  supersedes?: string;
  revokes?: string;
};

export type SmaMemoryRecord = {
  id: string;
  digest: string;
  type: SmaMemoryType;
  content: string;
  assertedBy: string;
  epistemicStatus: SmaEpistemicStatus;
  provenance: {
    sourceRefs: string[];
    capturedAt: string;
    method: string;
  };
  scope: string;
  sensitivity: SmaVisibility;
  confidence?: number;
  lifecycle: { status: SmaLifecycleStatus };
  supersedes?: string;
  revokes?: string;
};

export type SmaSoul = {
  version: number;
  purpose: string[];
  values: string[];
  boundaries: string[];
  voice: { language: string; tone: string; verbosity: string };
  capabilities: string[];
  commitments: string[];
  evolution: {
    approval: 'user-required';
    allowedChanges: string[];
    rollback: 'previous-snapshot';
  };
};

export type SmaManifest = {
  $schema: 'https://hashpass.tech/spec/sma/0.1/schema.json';
  type: 'sma.manifest';
  smaVersion: '0.1';
  archiveId: string;
  agent: { did: string; kind: 'companion'; controller: string; name: string };
  soul: { version: number; digest: string; visibility: 'private'; object: SmaSoul };
  memory: { root: string; sequence: number; recordCount: number };
  storage: [];
  privacy: {
    defaultVisibility: 'private';
    encryption: 'required';
    publicAnchor: 'commitment-only';
    deletion: 'local-delete-until-authenticated-storage';
  };
  proofs: [];
};

export type LocalSmaArchive = {
  ownerEmail: string;
  manifest: SmaManifest;
  soul: SmaSoul;
  records: SmaMemoryRecord[];
};

export type SmaArchiveState = {
  status: 'loading' | 'setup' | 'ready';
  archive: LocalSmaArchive | null;
  error: string | null;
};

/** What the page shows: the loading note, the first-setup dialog, the public landing, or the full workspace. */
export type GateView = 'loading' | 'setup' | 'landing' | 'workspace';

export type SmaSetupProps = {
  onComplete: (email: string) => Promise<void>;
  onDismiss: () => void;
  error: string | null;
};

export type SmaMemoryPanelProps = {
  archive: LocalSmaArchive;
  onRemember: (input: SmaMemoryInput) => Promise<boolean>;
  onReset: () => void;
  onExport: () => string;
  error: string | null;
};
