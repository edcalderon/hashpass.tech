# Agent-memory standards landscape

**Research date:** 2026-10-27. This is a review of public specifications and repositories, not a claim that any project has universal adoption.

## Findings

There is no single ratified standard that combines portable agent memory, a governed agent “soul”, decentralized storage, deletion semantics, agent-to-agent transport and blockchain anchoring. The closest work is complementary:

| Project/standard | What it standardizes | What SMA adds or keeps separate |
| --- | --- | --- |
| [AMP](https://github.com/agentmemoryprotocol/agentmemoryprotocol) | Human-readable Markdown/Git-native memory stores, nodes, links and portability. | A signed JSON manifest, soul governance, cryptographic object identity and decentralized storage adapters. |
| [OMS](https://github.com/openmemoryspec/oms) | Content-addressed memory grains, deterministic encoding, signatures, privacy and CAL/SML query/context layers. | A smaller portable profile, explicit soul state, provider-neutral storage and chain-anchor boundaries. |
| [AMCP](https://github.com/nunchi-ai/amcp) | Memory records, recall/import/export APIs, capabilities and soft/hard/cryptographic lifecycle profiles. | A content-addressed archive/root model and governed soul evolution. |
| [OAMP](https://github.com/deep-thinking-lab/open-agent-memory-protocol) | Knowledge and user-model layers, provenance and privacy requirements. | DID/controller proofs, immutable lineage, storage adapters and chain-neutral anchoring. |
| [KIP](https://github.com/ldclabs/KIP) | Cognitive state, evidence, assertions, belief projection, authority and change streams. | SMA maps to KIP rather than flattening its epistemic model; SMA focuses on portable interchange and storage. |
| [W3C DID Core](https://www.w3.org/TR/did-core/) | Decentralized identifiers, documents, verification methods and service endpoints. | SMA uses DIDs for identity but defines the memory/soul data model itself. |
| [W3C VC Data Model](https://www.w3.org/TR/vc-data-model/) and [Data Integrity](https://www.w3.org/TR/vc-data-integrity/) | Claims, credentials, presentations and cryptographic proofs. | SMA records are not credentials; use VC/DI for attestations, consent or selective disclosure where appropriate. |
| [IPFS/IPLD](https://docs.ipfs.tech/concepts/how-ipfs-works/) | Content addressing and Merkle-DAG data retrieval. | SMA adds encryption, pin/retention disclosure, mutable-root pointers and user deletion expectations. |
| [MCP](https://modelcontextprotocol.io/specification/draft/server/index) | Resource, prompt and tool access from clients to servers. | MCP is an adapter surface, not an ownership or memory persistence standard. |
| [A2A](https://a2aproject.github.io/A2A/latest/specification/) | Agent identity, tasks, messages and artifacts. | SMA can travel as an artifact/reference, but A2A context is not durable personal memory. |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Typed structured-data hashing and signing. | SMA uses it for optional anchor authorization, not as a memory format. |
| [ERC-1577](https://eips.ethereum.org/EIPS/eip-1577) and ENS `contenthash` | Machine-readable content pointers, including IPFS CIDs. | SMA can use ENS/IPNS as discovery pointers while treating immutable SMA root digests as authoritative. |
| [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844) | Blob-carrying transactions for data availability. | Its blob retention model is not a permanent archive; SMA must not use it as the sole memory store. |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | On-chain agent registration with an off-chain registration file and service endpoints. | SMA can be advertised as a service/archive endpoint; it does not replace the memory format. |

## Recommendation

Adopt SMA as a **profile and adapter contract** first. Publish the JSON Schema, example vectors and import mappings, then implement a local encrypted store and an IPFS test adapter. Only after the profile has independent implementations should the project submit the optional Ethereum root registry as an ERC-style Standards Track proposal.

The Ethereum proposal should be small because Ethereum is a commitment and discovery layer, not a private data store. A minimal anchor is sufficient: agent identifier, SMA schema digest, current root digest, previous root digest, sequence, controller and optional pointer digest. The archive itself remains encrypted and off-chain.

## Interoperability risks

- **Same word, different semantics:** “confidence”, “memory”, “belief” and “preference” are not interchangeable. Adapters must preserve epistemic status and disclose lossy conversions.
- **Immutable does not mean available:** IPFS integrity is not a pinning or replication guarantee.
- **Signed does not mean true:** signatures identify an issuer/key and protect integrity; they do not validate a claim.
- **Deletion cannot erase replicas:** deletion requires logical tombstones, primary-store removal where possible and cryptographic erasure of encrypted payload keys.
- **Soul drift is a governance problem:** an agent cannot be allowed to rewrite its own authority, boundaries or controller merely because a model generated a new instruction.
- **Public identifiers correlate behavior:** DIDs, timestamps, IPFS provider activity and on-chain sequences can leak linkability even when payloads are encrypted.
