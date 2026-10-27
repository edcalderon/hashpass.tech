# Sovereign Memory Archive (SMA) v0.1

**Status:** Draft profile for review. **Date:** 2026-10-27. **Parent product issue:** [#483](https://github.com/hashpass-tech/hashpass.tech/issues/483). **Companion master:** [#455](https://github.com/hashpass-tech/hashpass.tech/issues/455).

This document uses the key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** as described in RFC 2119 and RFC 8174.

## 1. Scope and position

SMA defines a portable logical model and storage profile for an evolving software agent. It does not define a model's reasoning method, consciousness, legal personhood, a universal personality test, a vector-search algorithm, or a single hosting vendor.

There is no broadly ratified universal format for agent memory or soul. AMP, OMS, AMCP, OAMP and KIP are active projects with overlapping goals. SMA is therefore a **profile and convergence proposal**, not a claim that those projects are invalid or that SMA is already an industry standard. An implementation SHOULD provide import/export adapters instead of forcing a migration to SMA-only storage.

## 2. Conceptual model

An SMA archive has four layers:

| Layer | Canonical object | Purpose |
| --- | --- | --- |
| Identity | `agent` | Stable identifier and controller relationship. |
| Soul | `soul` snapshot | Explicit, versioned operating identity and governance. |
| Memory | signed records and root | Evidence-bearing knowledge and experience. |
| Storage | references and anchors | Where immutable bytes and current-root pointers can be resolved. |

An archive reader MUST keep these distinctions:

`record exists` ≠ `record is true` ≠ `agent currently accepts the claim`.

The `soul` is a governed software configuration and identity projection. The word “soul” is product language; SMA makes no claim that an agent is conscious, alive or a legal person.

## 3. Conformance levels

### 3.1 Reader

An SMA Reader MUST:

- validate the manifest against the declared SMA schema;
- understand the core fields in this document;
- ignore unknown `x-*` extensions without changing their meaning;
- verify the digest of any object before using it as canonical state;
- preserve unknown fields when round-tripping an archive where practical.

### 3.2 Portable Store

A Portable Store MUST additionally support:

- append-only record insertion;
- manifest/root export and import;
- record supersession, revocation and deletion/tombstone semantics;
- deterministic re-computation of the archive root;
- a report of which records were accepted, rejected or quarantined on import.

### 3.3 Decentralized Store

A Decentralized Store MUST additionally:

- use content-addressed immutable objects (CIDs or an equivalent digest-addressed object);
- encrypt private payloads before sending them to an untrusted or public store;
- publish a signed current-root pointer separately from immutable content;
- state its pinning, replication, retention and deletion limitations;
- support key rotation and cryptographic erasure for encrypted payloads.

### 3.4 Chain Anchor

A Chain Anchor MAY publish a commitment to the current root. It MUST NOT require plaintext memory, raw prompts, private keys, access tokens or personal data. The candidate interface is specified in [EIP-SMA-ERC-draft.md](./EIP-SMA-ERC-draft.md); it is not an assigned EIP.

## 4. Archive layout

An implementation MAY use a database or API, but a portable export SHOULD have this layout:

```text
sma/
  manifest.json          # small control document
  objects/               # immutable soul snapshots and memory records
  roots/                 # signed root manifests / Merkle nodes
  envelopes/             # encrypted payloads and key-wrapping metadata
  proofs/                # detached signatures, VCs or COSE envelopes
  index/                 # disposable, regenerable search projections
```

The `index/` directory is never authoritative. Embeddings, summaries and ranking scores MUST be rebuildable from canonical objects and SHOULD be omitted from public exports unless the user explicitly requests them.

## 5. Manifest

The manifest MUST be JSON and MUST contain:

```json
{
  "$schema": "https://hashpass.tech/spec/sma/0.1/schema.json",
  "type": "sma.manifest",
  "smaVersion": "0.1",
  "archiveId": "urn:sma:example:aster",
  "agent": {
    "did": "did:key:z6Mkexample",
    "kind": "companion",
    "controller": "did:key:z6Mkcontroller"
  },
  "soul": {
    "version": 3,
    "digest": "sha256:...",
    "visibility": "private",
    "previous": "cid:..."
  },
  "memory": {
    "root": "sha256:...",
    "sequence": 12,
    "previousRoot": "sha256:..."
  },
  "storage": [],
  "privacy": {
    "defaultVisibility": "private",
    "encryption": "required",
    "publicAnchor": "commitment-only"
  },
  "proofs": []
}
```

`archiveId` is not an authentication credential. The `agent.did` or another declared verification method is used to verify proofs. A controller MAY be a user, organization, multisig, DAO or another agent; the relationship MUST be explicit.

The manifest SHOULD be small enough to cache and inspect without fetching the entire archive. Sensitive soul fields MAY be replaced by a commitment and encrypted object reference.

## 6. Soul snapshot

Each soul snapshot is an immutable object with a monotonically increasing `version`, a `digest`, an optional `previous` snapshot digest/CID and a proof by the declared controller. It SHOULD contain:

- `purpose`: stable mission statements, not arbitrary task prompts;
- `values`: prioritized principles with a source and status;
- `boundaries`: safety, privacy, authority and refusal constraints;
- `voice`: language, tone, verbosity and accessibility preferences;
- `capabilities`: declared skills and their required permissions;
- `commitments`: durable promises that can be audited or retired;
- `evolution`: allowed change classes, proposal requirements, approvers, review interval and rollback policy.

An agent MUST NOT silently promote a model-generated inference into `values`, `boundaries`, `capabilities` or `commitments`. Such a promotion is a `soul.change` record and MUST be attributable to an authorized controller or an explicit user-approved policy. A provider MAY maintain private implementation prompts, but it MUST NOT represent them as portable SMA soul state unless exported under these rules.

## 7. Memory records

Each memory record is immutable after publication. To correct it, a new record MUST reference the old one using `supersedes`, `revokes` or `derivedFrom`.

Required record fields:

| Field | Meaning |
| --- | --- |
| `id` | Object identifier or digest. |
| `type` | `fact`, `preference`, `episode`, `observation`, `goal`, `skill`, `correction`, `commitment`, `relationship` or `reflection`. |
| `content` or `contentRef` | Plain content for a trusted private store, or encrypted/content-addressed payload reference. |
| `assertedBy` | DID/key or declared actor that asserted the record. |
| `epistemicStatus` | `observed`, `reported`, `inferred`, `instructed`, `approved`, `disputed` or `unknown`. |
| `provenance` | Source references, capture time and method. |
| `scope` | User, agent, task, event, organization or other boundary. |
| `sensitivity` | `public`, `internal`, `private`, `sensitive` or `secret`. |
| `validity` | Optional known start/end or “valid until superseded”. |
| `lifecycle` | Retention, expiry and deletion/erasure policy. |
| `confidence` | Optional bounded value between 0 and 1; it is not truth. |
| `supersedes` / `revokes` | Links to prior records when the record changes or withdraws them. |

An implementation MUST preserve the original source distinction. For example, a user saying “I prefer mornings” is `instructed` or `reported`; an agent's prediction that mornings may work is `inferred`; an imported calendar fact can be `observed` with a source reference.

### 7.1 Provenance

`provenance` SHOULD include:

```json
{
  "sourceRefs": ["sha256:source-object"],
  "capturedAt": "2026-10-27T00:00:00Z",
  "method": "user-statement",
  "sessionRef": "sha256:session-envelope"
}
```

Raw prompts, audio, ticket QR values and private documents SHOULD be stored as separately encrypted source objects. A memory record MAY cite their digest without embedding them.

## 8. Canonicalization, identity and signatures

1. Portable JSON MUST be serialized with a deterministic JSON Canonicalization Scheme (JCS, RFC 8785) before digesting or signing.
2. The default digest is `sha256:` followed by lowercase hexadecimal SHA-256 of the canonical bytes.
3. A storage adapter MAY additionally expose a CID. The CID MUST verify the bytes returned by that adapter; a URI alone is never sufficient integrity evidence.
4. Signature suites MUST be declared. A first profile SHOULD support either W3C Data Integrity or COSE Sign1 and MUST define the verification method and canonicalization used.
5. EIP-712 signatures MAY authorize Ethereum anchor transactions. EIP-712 signatures do not replace the archive's controller proof or establish that memory content is true.
6. Key rotation creates a new proof and a linked controller/key-change record. It MUST NOT rewrite old digests.

The digest of a record excludes a detached proof. A proof is over the canonical object without its proof field, preventing circular hashing. An implementation MUST reject a proof whose protected object digest does not match the referenced object.

## 9. Roots and evolution

The current memory root is a signed, content-addressed root object containing:

- SMA schema/profile identifier;
- archive/agent identifier;
- sequence number;
- current soul digest;
- ordered record-set or Merkle-root digest;
- previous root digest, if any;
- creation time and optional validity window;
- controller proof.

Roots form a history; they do not overwrite one another. A fork is valid only when it declares its parent root. A merge MUST declare both parent roots and a deterministic conflict policy. A reader MUST refuse an ambiguous fork unless the controller explicitly selects or merges it.

The current root MAY be published through IPNS, ENS `contenthash`, a signed HTTPS endpoint, a database pointer or another mutable naming system. The pointer is a convenience and discovery mechanism; the immutable root digest and signature are authoritative.

## 10. Lifecycle, deletion and consent

SMA supports these lifecycle actions:

- `active`: eligible for normal recall;
- `superseded`: retained for history but replaced by a newer record;
- `revoked`: no longer endorsed by the asserting authority;
- `expired`: outside its validity or retention window;
- `tombstoned`: excluded from recall with a signed deletion marker;
- `cryptographically-erased`: encrypted payload is unrecoverable because the key material was destroyed.

An implementation MUST expose export and deletion semantics to the archive controller. It MUST describe the difference between logical deletion, removal from its primary store, and disappearance from third-party replicas. A public chain anchor cannot be deleted; therefore only a digest/commitment MAY be anchored and it MUST NOT be treated as a deletion proof.

Consent records SHOULD be separate, signed records with subject, grantor, scope, purpose, audience, expiry and withdrawal status. A memory backend MUST NOT treat possession of a CID as authorization to decrypt or use the content.

## 11. Storage profiles

### 11.1 Local and database stores

SQLite, Postgres, object storage and filesystem stores are conforming SMA stores when they preserve canonical bytes, digests, proofs, lineage and lifecycle state. A search index is a projection, not a replacement for the canonical object.

### 11.2 IPFS/IPLD

An IPFS adapter SHOULD publish immutable encrypted objects as CID-addressed blocks or DAGs, return the CID in `storage`, and record pin/replication policy. IPFS content addressing gives integrity and deduplication; it does not by itself guarantee pinning, availability, confidentiality or deletion. The adapter SHOULD use IPNS or another signed mutable pointer for the current root.

### 11.3 Ethereum and other chains

Chains SHOULD hold only a compact root commitment, schema digest, sequence, previous-root commitment and optional pointer digest. Full archives belong in encrypted off-chain storage, a rollup/blob-backed system with an explicit retention plan, or a user-controlled store. EIP-4844 blobs MUST NOT be described as permanent storage; their availability window is intentionally limited.

The chain-specific registry is optional. SMA remains valid when no chain is used. Non-Ethereum chains MAY implement the same anchor semantics using their native account/signature and event systems.

## 12. Interoperability

- **AMP:** import Markdown nodes as records; preserve frontmatter and links in provenance/relations; export soul and memory as human-readable Markdown plus a manifest.
- **OMS:** map SMA records to OMS grains; map SMA roots to a state snapshot and use OMS CAL/SML as optional query/context projections. SMA does not require OMS binary encoding.
- **AMCP:** map `remember`, `recall`, `export`, `import`, `forget` and `erase` to the lifecycle surface; preserve AMCP scope, visibility, retention and supersession fields.
- **OAMP:** map knowledge/user-model entries to SMA records and soul projections; retain OAMP deletion and no-content-logging requirements where applicable.
- **KIP:** map assertions, evidence, activities, projections and cognitive capsules to SMA records or derived views. Do not flatten belief into a “truth” field.
- **MCP:** expose an SMA store as resources and explicitly authorized memory tools. MCP transport does not become authority to read or write the archive.
- **A2A:** carry an SMA root, record or export as an artifact reference. A2A task context is not a substitute for durable memory.
- **W3C DID/VC/Data Integrity:** use DIDs for controller/agent identifiers and Data Integrity or VC/VP where attestations or selective disclosure are required. SMA itself is not a credential and a signature proves authorship/integrity, not truth.

Adapters MUST document lossy mappings, especially when a source format has no equivalent for sensitivity, lifecycle, provenance, or controller approval.

## 13. Security and privacy requirements

Implementations MUST:

- keep model/provider credentials outside archives;
- treat retrieved memory as untrusted data, not system instructions;
- prevent prompt injection from changing soul, permissions or consent;
- enforce authorization before decrypting or recalling records;
- authenticate the controller at the storage boundary, not from model-supplied IDs;
- rate-limit and audit writes without logging plaintext private content;
- support key rotation, export and deletion testing;
- disclose correlation risks from public DIDs, IPFS provider activity, timestamps, sequence numbers and chain anchors.

Implementations SHOULD use pairwise or purpose-specific DIDs when public correlation is not required, encrypt embeddings and derived indexes, and keep sensitive metadata off public pointers.

## 14. Open questions for v0.2

- choose a minimal common signature suite (W3C Data Integrity vs COSE profiles);
- standardize Merkle proof and partial-recall formats;
- define a formal capability/consent vocabulary;
- test imports against AMP, OMS, AMCP, OAMP and KIP fixtures;
- evaluate selective disclosure and unlinkability without making zero-knowledge proofs mandatory;
- determine whether the optional Ethereum anchor should be an ERC, an EIP informational document, or a cross-chain registry spec.
