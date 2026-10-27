import type { LocalSmaArchive, SmaManifest, SmaMemoryInput, SmaMemoryRecord, SmaSoul } from './types';

const SMA_SCHEMA = 'https://hashpass.tech/spec/sma/0.1/schema.json' as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new Error('Enter a valid email address to create your Companion.');
  return normalized;
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
}

export async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

function randomId(prefix: string): string {
  const uuid = globalThis.crypto.randomUUID();
  return `${prefix}-${uuid}`;
}

function controllerForEmail(emailDigest: string): string {
  return `urn:hashpass:email-sha256:${emailDigest.slice('sha256:'.length)}`;
}

function soulForCompanion(): SmaSoul {
  return {
    version: 1,
    purpose: ['Help the user make truthful, privacy-respecting progress on real-world plans.'],
    values: ['user-control', 'privacy-first', 'truthful-evidence', 'gentle-evolution'],
    boundaries: [
      'Never claim an action happened when it only produced a draft.',
      'Never turn model inference into a user preference or permission without approval.',
      'Never expose private memory, credentials, tickets or raw prompts through the Companion.',
    ],
    voice: {language: 'en', tone: 'warm', verbosity: 'concise'},
    capabilities: ['local-memory'],
    commitments: ['Keep the user in control of memory and changes to the Companion soul.'],
    evolution: {
      approval: 'user-required',
      allowedChanges: ['voice', 'preferences', 'goals'],
      rollback: 'previous-snapshot',
    },
  };
}

function rootPayload(archive: Pick<LocalSmaArchive, 'manifest' | 'records'>, soulDigest: string) {
  return {
    type: 'sma.root',
    smaVersion: '0.1',
    archiveId: archive.manifest.archiveId,
    sequence: archive.records.length,
    soulDigest,
    records: archive.records.map((record) => record.digest),
  };
}

function unsignedRecord(record: SmaMemoryRecord): Omit<SmaMemoryRecord, 'digest'> {
  const {digest: _digest, ...unsigned} = record;
  return unsigned;
}

async function refreshManifest(archive: LocalSmaArchive): Promise<LocalSmaArchive> {
  const soulDigest = await sha256(archive.soul);
  const rootDigest = await sha256(rootPayload(archive, soulDigest));
  const manifest: SmaManifest = {
    ...archive.manifest,
    soul: {...archive.manifest.soul, digest: soulDigest, object: archive.soul},
    memory: {
      ...archive.manifest.memory,
      root: rootDigest,
      sequence: archive.records.length,
      recordCount: archive.records.length,
    },
  };
  return {...archive, manifest};
}

export async function createLocalArchive(email: string, name = 'Companion'): Promise<LocalSmaArchive> {
  const ownerEmail = normalizeEmail(email);
  const companionId = randomId('companion');
  const soul = soulForCompanion();
  const soulDigest = await sha256(soul);
  const archive: LocalSmaArchive = {
    ownerEmail,
    soul,
    records: [],
    manifest: {
      $schema: SMA_SCHEMA,
      type: 'sma.manifest',
      smaVersion: '0.1',
      archiveId: `urn:sma:hashpass:companion:${companionId}`,
      agent: {
        did: `did:hashpass:companion:${companionId}`,
        kind: 'companion',
        controller: controllerForEmail(await sha256(ownerEmail)),
        name,
      },
      soul: {version: soul.version, digest: soulDigest, visibility: 'private', object: soul},
      memory: {root: '', sequence: 0, recordCount: 0},
      storage: [],
      privacy: {
        defaultVisibility: 'private',
        encryption: 'required',
        publicAnchor: 'commitment-only',
        deletion: 'local-delete-until-authenticated-storage',
      },
      proofs: [],
    },
  };
  return refreshManifest(archive);
}

export async function appendMemory(archive: LocalSmaArchive, input: SmaMemoryInput): Promise<LocalSmaArchive> {
  const content = input.content.trim();
  if (!content) throw new Error('Memory content cannot be empty.');
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) throw new Error('Memory confidence must be between 0 and 1.');
  const unsigned: Omit<SmaMemoryRecord, 'digest'> = {
    id: randomId('record'),
    type: input.type,
    content,
    assertedBy: archive.manifest.agent.did,
    epistemicStatus: input.epistemicStatus,
    provenance: {sourceRefs: [], capturedAt: new Date().toISOString(), method: input.provenanceMethod ?? 'user-statement'},
    scope: input.scope,
    sensitivity: input.sensitivity,
    ...(input.confidence === undefined ? {} : {confidence: input.confidence}),
    lifecycle: {status: 'active'},
    ...(input.supersedes ? {supersedes: input.supersedes} : {}),
    ...(input.revokes ? {revokes: input.revokes} : {}),
  };
  const record: SmaMemoryRecord = {...unsigned, digest: await sha256(unsigned)};
  return refreshManifest({...archive, records: [...archive.records, record]});
}

export async function assertArchive(archive: LocalSmaArchive): Promise<void> {
  if (archive.manifest.$schema !== SMA_SCHEMA || archive.manifest.type !== 'sma.manifest' || archive.manifest.smaVersion !== '0.1') throw new Error('Unsupported SMA manifest.');
  if (!archive.manifest.agent.did.startsWith('did:') || archive.manifest.agent.kind !== 'companion') throw new Error('SMA archive has an invalid Companion identity.');
  if (archive.manifest.memory.sequence !== archive.records.length || archive.manifest.memory.recordCount !== archive.records.length) throw new Error('SMA memory sequence is inconsistent.');
  const soulDigest = await sha256(archive.soul);
  if (archive.manifest.soul.digest !== soulDigest) throw new Error('SMA soul digest does not match its content.');
  for (const record of archive.records) {
    if (record.digest !== await sha256(unsignedRecord(record))) throw new Error(`SMA record ${record.id} failed integrity validation.`);
  }
  const rootDigest = await sha256(rootPayload(archive, soulDigest));
  if (archive.manifest.memory.root !== rootDigest) throw new Error('SMA memory root does not match its records.');
}

export function serializeArchive(archive: LocalSmaArchive): string {
  return JSON.stringify({manifest: archive.manifest, soul: archive.soul, records: archive.records}, null, 2);
}

export async function importArchive(serialized: string, email: string): Promise<LocalSmaArchive> {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed) || !isRecord(parsed.manifest) || !isRecord(parsed.soul) || !Array.isArray(parsed.records)) throw new Error('SMA export is missing its manifest, soul or records.');
  const ownerEmail = normalizeEmail(email);
  const controller = controllerForEmail(await sha256(ownerEmail));
  const manifest = parsed.manifest as unknown as SmaManifest;
  if (manifest.agent?.controller !== controller) throw new Error('This SMA archive belongs to a different email identifier.');
  const archive: LocalSmaArchive = {ownerEmail, manifest, soul: parsed.soul as unknown as SmaSoul, records: parsed.records as unknown as SmaMemoryRecord[]};
  await assertArchive(archive);
  return archive;
}
