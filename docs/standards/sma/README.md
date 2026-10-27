# Sovereign Memory Archive (SMA)

**Status:** draft profile, version 0.1. No universal agent-memory or agent-soul standard is claimed, and no Ethereum EIP number has been assigned.

SMA is a proposed portable archive format for an agent that must survive a provider, framework, product or storage migration. It separates:

- **Soul:** the agent's signed, versioned identity, purpose, values, boundaries, voice, capabilities and evolution policy.
- **Memory:** append-only, provenance-bearing records that may be recalled, superseded, revoked or erased.
- **Storage:** a replaceable adapter. A local file, SQL database, object store, IPFS/IPLD archive and blockchain anchor can all carry the same logical archive.
- **Interop:** adapters for existing agent protocols rather than a requirement to adopt HASHPASS, MCP, A2A or Ethereum.

The proposal is intentionally conservative: immutable content and signatures establish integrity; they do not make a memory true, a soul sentient or a decentralized storage provider permanent. Private content must be encrypted before public or third-party storage.

## Files

- [SMA v0.1 normative profile](./SMA-0.1.md)
- [JSON Schema](./sma-0.1.schema.json)
- [Canonical example manifest](./example-manifest.json)
- [Landscape and interoperability notes](./landscape.md)
- [Candidate ERC/EIP draft for optional root anchoring](./EIP-SMA-ERC-draft.md)

## Companion relationship

The HASHPASS Companion can adopt SMA as an opt-in persistence boundary. Guest memory remains local and ephemeral. Durable memory requires an explicit user decision, user-controlled export/deletion, encryption, and a server-side authorization boundary. SMA is not a dependency of the Meta Hackathon P0 flow and does not authorize production chain deployment or public pinning of user data.

## Design principles

1. The user controls the archive and may migrate it.
2. A record says who asserted or observed something, when and with what evidence; it does not silently become truth.
3. Soul changes are proposed and versioned; they are not hidden prompt rewrites.
4. Public chains store commitments and pointers, never raw personal memory.
5. Derived indexes, embeddings and summaries are disposable projections, not the canonical archive.
6. Unknown `x-*` extensions are ignored by readers and never redefine core fields.
