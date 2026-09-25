# @hashpass/wallet

Client-side wallet core for HASHPASS. Private workspace package; not yet enabled
for production users. The active plan is
[task-non-custodial-wallet.md](../../.agents/active/task-non-custodial-wallet.md).

## Implemented

- CSPRNG-backed 24-word English BIP-39 generation; checksum-validated recovery.
- Versioned, public-only ETH/BTC/SOL derivation with explicit network selection.
- AES-256-GCM vault, PBKDF2-SHA256 with 600,000 iterations, fresh salt/nonce,
  authenticated environment/owner/wallet binding and bounded untrusted parsing.
- IndexedDB transactional compare-and-swap and a serialized native keychain
  adapter. Neither has an insecure persistence fallback.
- No-overwrite creation, password rotation, fresh-password recovery reveal/export,
  portable encrypted recovery import and expected-address verification.
- Randomized local phrase challenge. Its `dispose()` invalidates the challenge.

## Integration contract

Construct `LocalWallet` with a **server-resolved canonical owner and wallet ID**,
explicit environment, platform storage, and the platform CSPRNG. The mobile app's
`createDeviceWallet` supplies Expo SecureStore and Expo Crypto on native, or
IndexedDB in a secure browser context. Use `createNew(network, password)` to
ensure the injected native RNG is used for mnemonic generation as well as salts.

Do not initialize a wallet from a client-supplied account ID, silently replace a
missing vault, or consider successful decryption an authorization to sign.
`unlock()` returns only public addresses; no signing API exists yet. All sensitive
methods require a password again. No unlocked secret/password is cached on the
instance. `lock()` invalidates in-flight operations without deleting durable data.
Mount `bindWalletLifecycle`, dispose on auth changes/unmount, and also clear any
phrase/password fields that the UI itself holds. Lifecycle integration into the
onboarding component remains pending.

A create/rotation that is interrupted immediately after storage commits can
report failure while the vault is already durable. Re-read and recover; **never
clear the store and generate a replacement**. Native serialization protects a
single JS runtime only. All native writers must share this adapter; extensions or
headless runtimes need an OS-level lock before they may write wallet records.

Passwords are a separate local vault secret, not the BIP-39 optional passphrase.
Version 1 uses an empty BIP-39 passphrase. Passwords must be 16–256 characters,
with at least eight distinct characters and cannot be numeric-only. The UI must
explain that password loss requires recovery; the server cannot reset a vault.

## Derivation manifest v1

| Chain | First account | Additional index `i` |
| --- | --- | --- |
| Ethereum | `m/44'/60'/0'/0/0` | final address index `i` |
| Bitcoin mainnet | `m/84'/0'/0'/0/0` | hardened account index `i` |
| Bitcoin testnet | `m/84'/1'/0'/0/0` | hardened account index `i` |
| Solana | `m/44'/501'/0'/0'` | hardened account index `i` |

BTC uses native SegWit. Additional Bitcoin change/address management is not yet
implemented. Recovery files currently cover primary account index 0. Solana and
Ethereum addresses are the same on mainnet/testnet; the manifest network remains
part of wallet identity. External wallet discovery must be tested before claiming
MetaMask or hardware compatibility.

## Backup format

`hashpass-recovery` v1 contains an encrypted portable mnemonic/network envelope.
It includes no canonical user ID or device identifier. It is **not** an Ethereum
V3 keystore and must never be labeled as a MetaMask JSON import. Use the standard
BIP-39 phrase for interoperable recovery. No plaintext file-download or clipboard
behavior is implemented by this package.

A phrase challenge and re-importing the actual exported file are both required
by the planned signing policy. A generated file or successful download alone is
not backup proof. The app must bind proof to the wallet fingerprint and clear it
on identity changes. No challenge answers or secrets may be sent to the server.

## Validation and limitations

Run with the repository's pinned Node runtime:

```
pnpm --filter @hashpass/wallet test
pnpm --filter @hashpass/wallet typecheck
pnpm --filter @hashpass/wallet test:db
```

The database tests require PostgreSQL server tools and run in a temporary local
cluster with Unix sockets only. They do not connect to a configured app database.

## Enrollment integration

Migration V097 enrolls canonical users at signup and backfills existing users
with public metadata only. The authenticated `/api/wallet/enrollment` API owns
reservation and registration; browser database roles cannot access the table or
RPCs directly. Only a validated primary-account public manifest is accepted.
Addresses are self-reported metadata, not verified payment destinations.

`WalletProvisioning` reserves before local generation, persists before uploading
addresses, and reuses the stored vault after failed registration. A missing vault
for an already registered account requires recovery. An interrupted reservation
without a local vault requires an explicit recovery/reset workflow that is not
implemented; no timeout generates a replacement seed.

Setup mutations currently require the server flag
`HASHPASS_WALLET_SETUP_ENABLED=true`, development environment and testnet. Production
is disabled even when the flag is present. The app displays enrollment status and
registered addresses, but does not expose provisioning controls until the backup
and recovery UI is complete. The migration has only been tested locally.

Tests use public BIP-39/BIP-84 vectors and an independent Node crypto calculation
for Solana; never fund test accounts. Storage tests use fake-indexeddb and an
in-memory native boundary; they do not prove hardware-backed storage on a phone.

Dependencies are pinned, but this integration has not had an independent security
audit. KDF benchmarking on native devices, secure-storage/reinstall checks, browser
XSS/CSP review, real external-wallet recovery, transaction signing and hardware
transports remain release gates. JS strings and library-internal copies cannot be
reliably erased; byte-array wiping is best effort. Never log secrets or include
sensitive recovery screens in analytics/session recordings.

Reference standards and upstream implementations:
- https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
- https://github.com/satoshilabs/slips/blob/master/slip-0010.md
- https://github.com/paulmillr/scure-bip32
- https://github.com/paulmillr/scure-bip39
- https://github.com/paulmillr/micro-key-producer
