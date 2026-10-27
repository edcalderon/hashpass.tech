# ERC-XXXX: Sovereign Memory Archive Root Registry

**Status:** Draft for discussion. **EIP number:** not assigned. **Category:** Standards Track ERC candidate. **Requires:** EIP-712 for optional typed authorization; uses CID/multihash and SMA v0.1 semantics.

## Abstract

This proposal defines a minimal Ethereum registry for anchoring the current root of a Sovereign Memory Archive (SMA). The registry stores a compact commitment and emits an event that lets clients discover a signed, content-addressed archive stored off-chain. It does not store or expose the agent's memory, soul, prompts, embeddings, keys or personal data.

The SMA format is chain-neutral and remains useful without this registry. The registry is an optional integrity/discovery adapter.

## Motivation

Agent memory is usually trapped in a vendor database, while public blockchain storage is expensive, observable and difficult to delete. A useful interoperability layer needs a verifiable checkpoint without pretending that a public chain is a private database or a permanent IPFS pin.

Existing building blocks cover the pieces: EIP-712 signs typed data; ENS `contenthash` can point to content-addressed resources; ERC-8004 registers agents and service endpoints; IPFS/IPLD provides content-addressed objects. This proposal composes those pieces for a single SMA root without redefining them.

## Specification

### Identifiers and digests

- `agentId` is the registry-local identifier. An implementation MAY derive it as `bytes32(keccak256(bytes(agentDid)))`, but the contract MUST treat it as an opaque value.
- `rootDigest` and `schemaDigest` are `bytes32` encodings of the SMA-declared digest. The SMA profile's default is SHA-256 over JCS bytes; the digest algorithm MUST be declared off-chain.
- `previousRootDigest` is zero for the first root and otherwise MUST equal the registered root's digest.
- `pointerDigest` is an optional digest of the canonical pointer/URI descriptor. The pointer itself is resolved off-chain and MUST be verified against the signed SMA manifest and root digest.
- `sequence` starts at 0 and increases by exactly one for each root accepted by this registry.

### Interface

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

interface ISMAAnchorRegistry {
    struct Anchor {
        bytes32 rootDigest;
        bytes32 schemaDigest;
        bytes32 previousRootDigest;
        bytes32 pointerDigest;
        uint64 sequence;
        uint64 anchoredAt;
        address controller;
    }

    event SMARootAnchored(
        bytes32 indexed agentId,
        bytes32 indexed rootDigest,
        bytes32 schemaDigest,
        bytes32 previousRootDigest,
        bytes32 pointerDigest,
        uint64 sequence,
        address indexed controller
    );

    function anchorRoot(
        bytes32 agentId,
        bytes32 rootDigest,
        bytes32 schemaDigest,
        bytes32 previousRootDigest,
        bytes32 pointerDigest,
        uint64 sequence
    ) external;

    function latestRoot(bytes32 agentId) external view returns (Anchor memory);
}
```

The registry MUST reject an anchor when:

1. `rootDigest` or `schemaDigest` is zero;
2. `sequence` is not the next sequence for `agentId`;
3. `previousRootDigest` does not match the previous registered root (except for the first root);
4. the caller is not the registered controller or an authorization accepted by the implementation; or
5. the implementation's controller policy rejects the update.

The first caller becomes the controller for an unregistered `agentId`, unless the implementation requires a prior registration. Controller transfer MUST be explicit and MUST emit an event. A relayer MAY submit an EIP-712 authorization, but the authorization MUST bind `agentId`, all digest fields, `sequence`, `chainId`, `verifyingContract`, nonce/deadline and controller.

### Off-chain resolution

The archive pointer SHOULD resolve to an SMA manifest through `ipfs://`, `ipns://`, an ENS `contenthash`, HTTPS, a database gateway or another declared scheme. A client MUST:

1. fetch the manifest and root object;
2. verify the manifest's SMA schema and controller proof;
3. recompute the root digest and compare it to the on-chain `rootDigest`;
4. verify the chain id, registry address, `agentId`, sequence and previous-root relationship;
5. apply archive authorization before decrypting or recalling any object.

An on-chain match proves only that a controller anchored the digest. It does not prove that the content is truthful, safe, complete, available or still accessible.

## Privacy and security

- Plaintext memory, raw prompts, audio, embeddings, private keys, access tokens and personal data MUST NOT be written to this registry.
- Implementations MUST warn that roots, sequences, timestamps and controller addresses are public and correlatable.
- The registry MUST NOT be marketed as a deletion mechanism. A user can delete primary copies or destroy encryption keys, but historical chain commitments remain.
- A compromised controller key can anchor malicious roots. Controllers SHOULD use hardware-backed keys, multisig or an off-chain recovery policy and SHOULD record key rotation in SMA history.
- A chain reorganizes or forks. Clients MUST identify the chain and require the confirmation policy appropriate to their risk; they MUST NOT treat an unfinalized transaction as a permanent archive guarantee.
- A URI or CID can become unavailable even when its digest remains verifiable. Storage pinning and replication are separate operational responsibilities.

## Rationale and alternatives

This proposal anchors a root, not every record, to keep gas costs and public metadata low. A Merkle root allows selective proof of inclusion without exposing the full archive. IPFS, Filecoin, Arweave, databases and private stores can coexist behind the same SMA manifest.

EIP-4844 blobs are unsuitable as the sole archive because blob data is designed for data availability with a bounded retention period, not indefinite application storage. ENS `contenthash` or IPNS can provide mutable discovery, but the signed SMA root remains authoritative because mutable pointers can change.

## Backwards compatibility

The registry is additive. SMA Readers and Portable Stores do not need Ethereum. Existing agent registries, ENS names, IPFS pins, databases and A2A/MCP endpoints can be referenced without deploying this interface.

## Open questions before submission

- Should this be a Standards Track ERC, an Informational EIP, or a cross-chain content-commitment profile?
- Should controller transfer and recovery be in this interface or delegated to an existing ownership primitive?
- Should `rootDigest` support multicodec/version bytes instead of a fixed `bytes32` SHA-256-compatible slot?
- What finality guidance and event indexing requirements are appropriate across L1, L2 and non-EVM chains?
- Can two independent SMA implementations pass the same root, signature, fork/merge and deletion test vectors?

This draft must not be presented as an assigned EIP or deployed to mainnet before those questions are resolved and an independent review is complete.
