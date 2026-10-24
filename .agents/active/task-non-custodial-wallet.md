# Refactor the wallet and implement non-custodial multichain accounts

**Status:** Active — UI, vault/recovery primitives, enrollment API and provisioning coordinator implemented locally; onboarding/recovery UI implemented locally; signing not shipped
**Priority:** P0 / High
**Created:** 2026-09-20
**Scope:** HASHPASS mobile app and web wallet, registration, returning users, wallet metadata API

## User intent

Completely refactor the wallet to match the new app UI, remove dummy data, study
Alternun's actual wallet, and provide every existing/new user a non-custodial
Ethereum, Bitcoin and Solana wallet. Support easy recovery, seed backup/download,
MetaMask export/import and Ledger/hardware accounts. Keep wallets read-only until
backup verification and a separate signing password or proper second factor.

## Reference review

Reviewed GitHub HEAD `5b501af0d156093a7871b3935fcc8553b97f9ce1` of
[Alternun](https://github.com/alternun-development/alternun), including
`packages/wallet/README.md`, `crypto/hdWallet.ts`, `WalletCreationFlow.tsx`, and
`wallet.service.ts`; local checkout `7508c319` supplied additional vault/derivation
implementation context. Do not assume the local checkout equals GitHub HEAD.

- Reuse the architecture: client generation/derivation/signing, public account
  metadata on the API, chain adapters, retryable registration, separate recovery.
- Do not copy its nonstandard Bitcoin `44'` native-SegWit path. New HASHPASS
  accounts use BIP-84. Network and derivation path must be explicit and versioned.
- Its mnemonic backup envelope is custom, NOT an interoperable Ethereum V3
  private-key keystore. Do not label such a file “MetaMask import”.
- Its local vault uses a PIN, and web falls back to localStorage. A short PIN
  cannot protect a stolen encrypted web vault against offline guessing. Use a
  strong, separate wallet password for the first release; never login credentials.
- Alternun's external account link path is blocked pending ownership proof.
  HASHPASS must implement domain/network/expiry/nonce-bound proof before linking.

## Architecture decisions and invariants

1. **Client-only custody.** CSPRNG BIP-39 entropy and keys never reach API, logs,
   analytics, crash reports, clipboard by default, or tracked files. API persists
   only canonical owner ID, wallet ID, public addresses, paths, network, account
   source, and versioned setup metadata. Native storage and web vaults are separate
   adapters; fail closed when secure entropy/storage/crypto is unavailable.
2. **Registration and existing users.** Idempotently create wallet *enrollment*
   metadata at signup and backfill enrollment for existing users. Generate actual
   keys only on the user's authenticated device. Never generate seeds on the
   server for absent users. Returning users finish provisioning at next sign-in.
   Native may provision into device-protected storage before signing setup; web
   must acquire a password/passkey wrapping capability before durable generation.
   This platform distinction must be visible in onboarding, not hidden by claiming
   a usable wallet exists at registration. Lost local vault + known account means
   restore-required, never silently generate a replacement wallet/address.
3. **Identity/isolation.** Metadata references canonical `public.user`; resolve
   provider identity on the server, never accept owner IDs from a request body.
   Existing Supabase rewards/pass queries use `dbUserId`. Vault keys include
   environment, canonical owner, and wallet ID. Account switch/logout/background
   clears unlocked material. Concurrent setup/retry cannot overwrite a seed.
4. **First signing method:** strong separate password and authenticated encryption
   with a versioned, bounded KDF; benchmark web/Hermes devices before selecting
   parameters. TOTP alone is not an encryption key or a cryptographic second
   factor for a local seed. A later 2FA-only option needs a reviewed hardware/
   passkey-backed unwrap design; normal account 2FA is insufficient.
5. **Backup before signing.** Explicitly reveal phrase, offer encrypted backup
   download plus a clearly warned plaintext recovery export, then randomly
   challenge phrase words AND verify recovery from the exported encrypted file.
   Validate recovered addresses against the same wallet. A download click or
   checkbox is not proof. Challenge is local, CSPRNG-selected and invalidated on
   seed/account change. Backups/phrase export must be available BEFORE signing is
   enabled, to avoid a circular dependency. Do not send phrase answers to API.
6. **Policy enforcement.** Every send, message-sign, typed-data/permit, approval,
   swap and broadcast path checks wallet-bound backup evidence and a fresh unlock;
   enforce at the signer, not merely disabled buttons. Recheck after async work.
   Server verifies its own authorization for relay calls. Read-only is a HASHPASS
   application restriction: someone holding the exported seed can sign elsewhere.
7. **Hardware accounts.** External signer source, never seed import/export. Use
   provider discovery (EIP-6963/EIP-1193, Solana Wallet Standard) and a Bitcoin
   PSBT-capable transport with explicit capability detection. Test Ledger device
   confirmation, cancellation and disconnect; don't advertise unsupported chain/
   platform combinations. Track hardware recovery acknowledgement separately from
   software backup proof; HASHPASS cannot prove a hardware seed has been backed up.
8. **Real data only.** Missing provider/account/error is unavailable, never zero.
   Empty successful chain history differs from an unfetched history. Separate
   off-chain LUKAS rewards, points and event passes from crypto balances/NFTs.

## Recovery compatibility contract

| Chain | Initial mainnet path | Recovery/export |
| --- | --- | --- |
| Ethereum | `m/44'/60'/0'/0/0` | BIP-39 phrase; optional genuine EVM V3 single-key JSON |
| Bitcoin | `m/84'/0'/0'/0/0` | BIP-39, Native SegWit; persist account/change/address indices |
| Solana | `m/44'/501'/0'/0'` | BIP-39 + SLIP-0010; validate target-wallet discovery |

Bitcoin testnet uses coin type `1'`; no implicit network defaults. Additional
accounts require an explicit, documented discovery strategy per chain.
MetaMask now documents Bitcoin and Solana recovery through a recovery phrase;
support is version/platform-specific and must be verified in actual restore
tests before claiming compatibility. Custom mnemonic backups remain HASHPASS
recovery files. Never suggest importing a software seed into Ledger as equivalent
to a seed generated by the device.

Primary references:
- [MetaMask phrase import and derivation](https://support.metamask.io/configure/wallet/importing-a-seed-phrase-from-another-wallet-software-derivation-path/)
- [MetaMask Bitcoin](https://support.metamask.io/configure/networks/bitcoin/)
- [MetaMask hardware wallet guide](https://support.metamask.io/more-web3/wallets/hardware-wallet-hub)
- [Ledger Solana Wallet Standard](https://developers.ledger.com/docs/ledger-wallet-provider/blockchains/solana)

## Ordered execution and acceptance

### A — UI and honest data
- [x] Replace legacy token carousel/tabs with responsive themed overview, network
  availability, security explanation, real rewards, and existing real pass wallet.
- [x] Remove sample NFT ticket, fixed swap rates, synthetic balances and valuation.
- [x] Distinguish unavailable rewards from a confirmed zero; prevent stale data
  appearing after account switch. Preserve rewards refresh and genuine passes.
- [x] Introduce and test default-deny software-wallet signing prerequisites.
- [x] Run focused tests, changed-file typecheck, React Doctor and browser inspection.

### B — Cryptographic core and vault
- [x] Choose maintained BIP-39/BIP-32/SLIP-0010 libraries, pin/review dependencies;
  public test vectors for all chains; never implement custom cryptographic primitives.
- [x] Versioned derivation/network manifest; public-only derivation return values.
- [x] Versioned authenticated encryption, secure RNG checks and scoped storage keys.
- [x] IndexedDB atomic compare-and-swap; native serialized SecureStore adapter with
  no fallback; no-overwrite creation and authenticated password rotation.
- [x] In-flight-operation lock invalidation and native/web lifecycle binding helper.
- [x] Unit/integration coverage for corruption, wrong passwords, changed scope,
  concurrent creation, failed storage, lost vault and password rotation.
- [x] Wire lifecycle helper into mounted wallet onboarding and auth transitions.
- [ ] Benchmark KDF on supported Android/iOS/web devices and verify native secure
  storage/reinstall/crash behavior on devices. Native CAS assumes one JS writer;
  extensions/headless processes must not write wallets without a native lock.

### C — Enrollment and recovery UI/API
- [x] Owner-scoped metadata migration/RLS and canonical identity API;
  idempotent signup enrollment and existing-user backfill (metadata only).
- [ ] Apply and verify enrollment migration in target environments during rollout.
- [x] Client provisioning orchestrator with retry/resume across network failures.
- [x] Core randomized phrase challenge and portable encrypted backup round-trip
  verification against all three expected addresses.
- [x] Accessible phrase reveal/challenge UI, backup export/re-import verification UI,
  recovery flow and explicit lost-password/device handling. No funds/receive CTA
  before durable vault creation; warn about unrecoverable unbacked-up wallets.
- [ ] Full MetaMask Ethereum/Bitcoin/Solana round-trip matrix, recording versions,
  matching addresses and supported platforms; hardware recovery flow separately.

### D — Chain reads, signing and hardware
- [ ] Real native balances/activity with timestamps, stale/error/retry states,
  exact integer amounts, network binding, explicit RPC configuration and rate limits.
- [ ] Transaction simulation/fees/recipient/network confirmation and fail-closed
  signer; gas, UTXO/change/PSBT, and Solana blockhash/fee handling per chain.
- [ ] Hardware/provider link ownership proof, separate adapters and capability
  matrix; Ledger cancel/disconnect/reconnect coverage, never expose device seed UI.
- [ ] Bind fresh step-up evidence to wallet/session/intent, prevent replay and
  bypass through message signing, permits, alternate providers or direct relays.

### E — Rollout
- [ ] Threat-model/security review; browser XSS/CSP and telemetry redaction review.
- [ ] Web + Android + iOS recovery/device tests, testnet end-to-end transfer tests,
  accessibility/responsive/dark-mode review, API ownership negative tests.
- [ ] Feature-gated internal rollout, then signup + returning users; monitor only
  non-secret failure codes. Kill switch stops signing without deleting vaults.
- [ ] Production release only through repository release contract when requested.

## Definition of done

All phases verified; no fabricated assets; real user-owned ETH/BTC/SOL addresses;
successful external recovery; signing impossible inside HASHPASS until backup and
fresh step-up requirements hold; verified hardware support matrix. A redesigned
empty state alone does not complete this task.

## Execution log — 2026-09-20

- Rebuilt `/dashboard/wallet` using existing theme colors, responsive constrained
  layout, pill navigation and accessible security disclosure. Assets explicitly
  report setup unavailable; ETH/BTC/SOL are planned networks, not invented accounts.
- Removed legacy sample ticket, synthetic COP/VOI balances, fabricated USD values,
  fixed points conversion rates, and nonfunctional swap actions. Rewards read the
  authenticated Supabase balance using `dbUserId`; failures display unavailable,
  empty successful results display zero. Manual/event refresh remains available.
  Existing automatic balance subscription is not retained in this initial slice;
  real-time invalidation should be added alongside the shared chain data layer.
- Event passes now reuse `PassesDisplay`, preserving its owner-scoped service,
  retry states and real pass presentation. Added 33 English/Spanish messages;
  other locales use explicit English fallbacks until translated.
- Added `lib/wallet/signing-policy.ts` with wallet-bound backup/unlock prerequisite
  checks. This is a tested policy foundation, NOT a signer implementation or a
  security boundary by itself. No new key generation or signing is exposed.
- Validation: 41 tests across wallet policy, reward failure/account switching,
  screen navigation, existing pass component and Android layout guards passed.
  `npm run typecheck` passed for all 9 changed/new TypeScript files. React Doctor
  reported 100/100 for the changed app files. `git diff --check` passed.
- Local Expo web bundles compiled and `/dashboard/wallet` returned HTTP 200.
  PinchTab retry rendered the wallet and exercised the security disclosure with
  no reported browser errors. Checked tab bounds at 390px and 1280px viewports.
  Full visual/dark-mode, live reward/pass data and native device QA remain pending;
  no screenshots or private account data were captured.
- No production migration, user enrollment, wallet creation, commit, push or
  deployment was performed. Next implementation milestone is B (vault/core), then
  C (enrollment/recovery), before enabling any receive/sign/export controls.

### B progress — derivation and authenticated encryption

Completed public-only version-1 ETH/BTC/SOL derivation in `packages/wallet`.
Pinned scure BIP32/BIP39/base 2.4.0, btc-signer 2.4.1, micro-key-producer
SLIP-0010 0.10.2, noble ciphers/hashes 2.4.0 and ethers 6.15.0. Reviewed upstream
APIs/security notes and lockfile changes; install scripts were disabled. The
micro-key-producer package reports a missing optional `aesscr` CLI binary during
install; wallet code imports only its SLIP-0010 module, which passes tests.

Nine real-crypto tests pass: public vectors, independent Node crypto Solana
calculation, network/index validation, CSPRNG failures, password round-trip,
wrong-password/tamper/scope rejection and bounded envelope parsing. No test keys
are funded or used in the app. Public derivation exposes no keys or chain codes.

The initial vault format uses AES-256-GCM and PBKDF2-SHA256 (600,000 iterations),
with fresh 32-byte salt and 12-byte nonce and authenticated owner/environment/
wallet binding. This is a versioned starting cost, not a completed mobile KDF
benchmark or security audit. Native device performance remains a release gate.
Storage, interrupted operations, password rotation and app lifecycle are next.

### B/C progress — storage and recovery primitives

21 package tests now pass, including real encryption and password rotation,
concurrent writers through independent IndexedDB adapters, native write failure
recovery, no insecure fallback, account/environment scope isolation, randomized
backup challenge and encrypted recovery import with address matching. Package
TypeScript validation passes. Native storage is tested through its platform
boundary; hardware-backed behavior and KDF latency are not yet device-verified.

`LocalWallet` caches no unlocked phrase/password. Locking invalidates pending
operations; a seed persisted just before locking remains on disk for recovery.
A missing vault never causes silent key regeneration. Added app adapters for
Expo CSPRNG, device-only SecureStore and lifecycle cancellation; they are not yet
mounted by onboarding. The custom file is explicitly `hashpass-recovery` v1, not
MetaMask JSON. Standard mnemonic export/import is the portability mechanism.

### Validation checkpoint — core/vault implementation

- Completed `LocalWallet.createNew` using the injected platform CSPRNG, fresh
  password recovery reveal/export, and identity-checked restore onto an empty
  device store. A second create/restore never overwrites the existing vault.
- **23 wallet package tests pass** with real cryptography; **44 focused mobile
  app/regression tests pass**, including native runtime options, lifecycle
  invalidation, wallet UI, rewards, real-pass wrapper and Android layout guards.
- Root changed-file typecheck passes: wallet package plus 13 app TypeScript files.
  `git diff --check` passes. Public-vector Node 22.22.2 benchmark on this machine:
  encryption 1,350 ms, decryption 1,314 ms. These numbers are not mobile estimates.
- Added `packages/wallet/README.md` with the API/storage/recovery contract and
  explicit limitations. No native RNG polyfill is required: the device adapter
  supplies Expo Crypto directly, with no weak RNG or ordinary-storage fallback.
- Next: C enrollment metadata/schema and canonical identity API, followed by
  mounted onboarding/recovery UI and lifecycle cleanup. Keep native KDF/storage,
  MetaMask recovery, signing and physical Ledger verification open until tested.
- No real-user seed was generated, no secret was sent to a server, and no
  production migration, commit, push, release or deployment was performed.

### C progress — enrollment metadata and API

Added V097 with canonical `public.user` ownership, signup trigger and metadata-only
backfill. Anonymous/authenticated direct table and RPC access is revoked; server
mutations use locked reservation/registration functions. Reservations do not expire
into silent regeneration. Same-operation retries are idempotent; conflicting
registrations cannot replace addresses. Stored addresses are self-reported public
metadata, not ownership-verified payout destinations or signing authorization.

The `/api/wallet/enrollment` API resolves canonical identity, uses no-store responses,
limits JSON body size, accepts only public primary-account manifests, and binds
mutations to an expected wallet ID to catch account switches. Mutation identity
resolution removes ambient cookies before verifying the bearer, because the shared
resolver otherwise permits cookie fallback after an invalid bearer. Setup is
server-gated by `HASHPASS_WALLET_SETUP_ENABLED=true` and limited to development/testnet.

Validated migration against isolated local PostgreSQL 16: signup/backfill, role
permissions, idempotency, no replacement, and simultaneous reservations (one winner).
No remote schema or real user was changed. Onboarding/client orchestration is next.

### C progress — retry coordination and real enrollment status

- Added client-only provisioning orchestration: reservation before generation,
  durable seed reuse after a registration failure, recovery-required behavior on
  a new device, and identity/lifecycle cancellation checks. No seed/password is
  sent to the enrollment API. Three real-vault orchestration tests pass.
- Mounted account-scoped enrollment status in the wallet UI with loading, failure,
  retry and registered public-address states. No enrollment is presented as a
  generated wallet. English/Spanish copy distinguishes test networks and keeps
  balances/signing unavailable. Four UI tests cover retry and late account changes.
- Creation controls remain withheld until the recovery/backup UI is complete.
  The provisioning coordinator is tested but not exposed through the screen yet.
- Ten API tests cover canonical identity, body limits, cookie fallback isolation,
  public-only registration, account switching and production rollout gating.
- User reported a Metro build failure resolving `@hashpass/wallet/manifest`.
  Added `wallet` to Metro's explicit runtime workspace watch list. Full bundling
  verification and local server restart are in progress; unit/type checks alone
  do not verify the bundler's file visibility.

### Metro fix verified

The initial import failure exposed three Metro visibility problems: wallet was
missing from watched workspaces; workspace output exclusions also excluded
third-party `dist` entries; and nested dependency exclusions hid ethers' pinned
older noble hashes. Fixed the watch list and narrowed those exclusions. Two
regression tests cover manifest resolution and dependency visibility. Actual
Node v24.14.1 web and SSR compilation succeeds; `/dashboard/wallet` returns 200.

Current checks: 27 real-crypto wallet tests, 51 app/Android regression tests, two
Metro configuration tests, changed-file typecheck and isolated PostgreSQL checks
pass. React Doctor reported no specific issues but a 49/100 aggregate score; do
not present that score as a clean comprehensive audit. No production rollout.
User additionally requested a Node 24 baseline review; see the separate active
`task-node24-baseline.md`. Wallet onboarding and recovery UI remain next.

Latest workspace caveat: concurrent homepage edits introduced type errors in
`HowItWorks.web.tsx`, reproduced on both tested Node 24 patches. Wallet tests pass;
the latest whole-workspace typecheck is not green. PinchTab navigation timed out
under local load; no latest interactive browser QA pass is claimed. The fresh
isolated Metro HTTP/bundle check above passed before restarting the full stack.

The restored local stack on Node v24.21.0 now compiles web/SSR and returns HTTP
200 for `/dashboard/wallet` on port 8081. This run uses `CI=1` (Metro non-watching
validation mode). The missing wallet package/dependency import errors are gone.

Node baseline work is now implemented locally at v24.21.0 across project/CI/EAS
and deployment configuration. After dependency repair, 53 focused app/Metro/
Android regression tests pass; wallet crypto tests remain 27 passing. See the
Node baseline task for browser-download and unrelated workspace typecheck notes.
Wallet creation/backup/recovery UI, signers and hardware support remain active
work; metadata enrollment is not presented as completed non-custodial onboarding.

### Current execution — onboarding and minor-release preparation

User requested continuation and a minor release containing the completed changes.
Enrollment API/migration and retry-safe provisioning are already implemented and
locally tested; migration deployment is still pending. Next work is mounted
onboarding, lifecycle clearing, phrase challenge, encrypted file export/import
verification, and recovery on a new device. Keep creation development/testnet-only
and all signing disabled. MetaMask recovery matrix and Ledger integration remain
open. Prepare the protected minor-release PR after validation; do not merge before
required owner approval and checks. Nothing has been deployed in this session.

### Current checkpoint — onboarding and patch release preparation

- Mounted development-only onboarding: separate password confirmation, retry-safe
  provisioning, existing-wallet restoration without replacement, freshly authenticated
  phrase reveal, random word verification, encrypted export and actual file re-import
  verification against registered addresses. Explicit warned plaintext export included.
- Session-local backup proof never enables signing. Background/logout/account change
  clear sensitive UI and invalidate in-flight results; native screen capture protection
  and temporary-file cleanup are wired. English, Spanish and Korean copy is complete.
- 27 real crypto/storage tests and database RLS/idempotency/concurrent reservation
  tests pass; 42 app wallet tests pass. Native hardware/KDF benchmarking and actual
  MetaMask imports remain pending. Migration has not been applied remotely.
- User superseded the minor-release request with a **patch release** and requested
  reference-based landing card polish. Web/native vector illustrations, responsive
  3/2/1-column layouts, viewport entrances and reduced-motion handling implemented.
- Patch promotion and final full-suite/coverage validation are in progress. No
  production merge or deployment has occurred. Signing and Ledger remain pending.

PR #245 review fixes: enrollment no longer conflates Supabase auth IDs with the
canonical registry owner ID. Authenticated provider identity gates requests and
account remounts invalidate old responses, including users awaiting a bridge.
Reservation intent is persisted with CAS before the API call and consumed before
key generation. Lost reserve responses can retry the original operation; missing
or consumed intent fails closed. Core suite: 30 tests passed. Wallet UI: 42 tests
passed, followed by 9 onboarding tests including the newly enabled resume action.
Production remains disabled; no migration or signing rollout occurred.

## Execution log — 2026-10-24: PIN gate and hybrid vault (testnet/dev only)

- The wallet view is gated by `useWalletGuard` (`hooks/wallet-guard-machine.ts`): `checking → pin_setup | pin_entry | unlocked`, then `locked` on proof expiry, explicit lock or app background. A new `wallet:unlock` step-up scope (TTL 300s) is added to the app, SDK and CLI allow-lists. Without a PIN the person gets the `PinFlow` create wizard.
- Hybrid vault: `packages/wallet/src/hybrid-vault.ts`. The mnemonic is AES-256-GCM encrypted under a random DEK on the device; the DEK is wrapped by `HKDF(PBKDF2(PIN) ‖ serverShare)`. `serverShare = HMAC(HASHPASS_VAULT_KEK, user|wallet|keyVersion)` is released by `GET /api/wallet/vault` only against a valid `wallet:unlock` proof. A database dump alone cannot be brute-forced (the PIN space is 10,000); the server alone cannot open the seed; the PIN and DEK never leave the device. `rewrapHybridVault` supports PIN change without touching the seed ciphertext.
- Storage: `db/migrations/V137__wallet_vault.sql` (`user_wallet_vault`, service-role-only functions, optimistic version).
- Remaining: seed reveal + liability acknowledgment + download tied to the PIN, vault creation wired into wallet provisioning, PIN change / recovery (email OTP + recovery phrase) UI, PIN gating of send/request/claim, `HASHPASS_VAULT_KEK` provisioning (Infisical/Secrets Manager, mind the Lambda 4KB env limit), V137 DB test, mainnet review.

## Execution log — 2026-10-24: server half of PIN recovery (email code)

- New scope `wallet:recover` (TTL 600s) exists in the app/SDK/CLI allow-lists but is **not** mintable from the verify-PIN route: `PIN_MINTABLE_SCOPES` (app:unlock, wallet:sign, wallet:unlock) governs `lib/server/setup-api.ts`; only `POST /api/wallet/pin-recovery {action:'verify', code}` can mint it, after consuming an emailed six-digit code.
- `db/migrations/V138__wallet_pin_recovery.sql`: extends the `otp_codes` purpose CHECK with `wallet-pin-reset` (same HMAC-only storage, 10-minute expiry, five attempts, atomic `consume_email_otp`) and adds service-role-only `reset_user_pin(p_user_id, p_verifier)`, which overwrites the verifier and clears attempts/lockout. The route calls it only behind a `wallet:recover` proof.
- `app/api/wallet/pin-recovery+api.ts` (+ `lib/server/wallet-pin-recovery.ts`, `lib/wallet/pin-recovery-client.ts`): session+bearer identity, dev/testnet gate as on the vault route, 60s resend cooldown, generic errors, `no-store`, never logs codes or PINs. Email delivery reuses the login/deletion SMTP path.
- `vault+api.ts` now also accepts `wallet:recover` for GET and for replace (`expectedVersion > 0`); create (`expectedVersion 0`) stays `wallet:unlock`-only. **Ordering: the client re-wraps its vault under the new PIN first (using the recovery phrase), then calls set-pin** — the old PIN keeps working until the last step, and both steps fit inside the 600s proof, so a failure between them is retry-safe with the same proof.
- V138 has not been applied to any database; no remote change. Tests: `tests/wallet/pin-recovery-api.test.ts`, `tests/wallet/vault-recover-proof.test.ts`.

## Execution log — 2026-10-24: wallet lifecycle over the vault (create, reveal, change, recover)

- `packages/wallet/src/hybrid-wallet.ts` (`HybridWallet`, re-exported from the package): the full lifecycle over the hybrid vault with mocked-in-app transports but real vault crypto.
  - **Create** (`wallet.create`): reserve → generate mnemonic → `createHybridVault` → **vault saved before addresses are registered**, so a registered wallet always has a vault. An interrupted creation with an envelope already saved never mints a replacement seed — it opens the saved one. A registered wallet with no envelope (legacy device-local wallet) fails closed (`wallet_vault_missing`), never replaced.
  - **Reveal** (`wallet.reveal`): phrase decrypted only via the envelope, for display and download.
  - **Change PIN** (`wallet.changePin`): re-wrap the DEK (seed ciphertext untouched) → save → replace the server verifier; if the verifier change fails the vault is restored to the current PIN so vault and verifier can never disagree.
  - **Recover** (`wallet.recover`): emailed code produced the `wallet:recover` proof; the entered phrase must match the registered public addresses (fingerprint), so a wrong phrase cannot replace anyone's vault. Vault is re-created under the new PIN first, then `reset_user_pin` — retry-safe inside the 600s proof.
- UI: `components/wallet/WalletVaultFlow.tsx` driven by `hooks/wallet-vault-machine.ts` (xstate; context holds no secret; LOCK from background/account change restarts clean and clears the phrase). Steps: intro → PIN confirm → phrase (with the mandatory "I understand that if I lose this phrase my funds cannot be recovered, and HASHPASS is not responsible…" acknowledgment — download stays disabled until it is checked) → word challenge → home; home → reveal / change / forgot-PIN (code → phrase → new PIN). `PinFlow.onDone` now passes the entered digits straight to the closure that wraps/unwraps the vault — they are never stored.
- The password-based `WalletOnboarding` device-local flow is retired (`WalletEnrollmentView` mounts `WalletVaultFlow` for all states). i18n: `wallet.vault.*` added to `en.json`.
- Tests: `packages/wallet/test/hybrid-wallet.test.ts` (transport mocks, real crypto: no seed/PIN ever reaches a "server", interrupted-create reuse, change rollback, recovery phrase mismatch) and `apps/mobile-app/tests/wallet/wallet-vault-machine.test.ts`.
- Still open: PIN gating of send/request-money/claim-rewards surfaces (they do not exist as real sign flows yet), `HASHPASS_VAULT_KEK` provisioning (Infisical/Secrets Manager), V137 DB test and remote apply, non-English locales beyond es/ko, `pnpm check:design-system` (script does not exist in the repo), security review before mainnet.

## Execution log — 2026-10-24: one PIN per account, and encrypted phrase download

- **Single-PIN model verified and regression-guarded.** `user_pin.user_id` is the PRIMARY KEY (V128): one verifier per account, physically. Contacts' `SetupWizard`, the wallet gate and the wallet vault flow all call the same `/api/setup` route → `set_user_pin`/`verify_user_pin`; `setPin` exists in exactly two client call sites (PinFlow create — server answers `pin_already_set` unless no PIN exists, and PinFlow then switches to unlock — and the wallet's change-PIN path, which passes the current PIN and re-wraps the vault in the same flow). No surface can register a second PIN or silently change the one PIN out from under the vault.
- New DB regression harness `packages/wallet/test/db/pin.sql` + `run-pin-db.sh` (`pnpm -F @hashpass/wallet test:db:pin`): applies V128+V138 to a scratch Postgres and proves — one row per account (PK), a second `set_user_pin` without the current PIN raises `pin_already_set`, a wrong "current" counts as a guess and changes nothing, the wallet's change path swaps the single verifier (old PIN stops verifying), five wrong guesses lock and `reset_user_pin` (recovery) replaces the verifier and clears the lockout, and anon/authenticated roles have no direct table or function access.
- **Encrypted phrase download** added to the phrase screen (after the acknowledgment): "Download unprotected phrase" (raw, explicitly labeled) and "Download encrypted backup" — a separate password form (≥16 chars, 8 distinct, digits-only rejected) that runs `exportRecoveryBackup` (PBKDF2 600k + AES-256-GCM, HASHPASS recovery format, not a MetaMask keystore) and saves `hashpass-recovery.json`. Background/lock clears the form and both fields. Strings added for en/es/ko.


## Execution log — 2026-10-24: import of an external BIP-39 phrase, and visible setup-unavailable feedback

- **Import**: `HybridWallet.importPhrase(phrase, pin)` (`packages/wallet/src/hybrid-wallet.ts`). Compatibility is at the mnemonic level: any BIP-39 wallet (MetaMask, Trust, Ledger, Phantom, …) can export a phrase, and the same seed derives the standard accounts — Ethereum `m/44'/60'/0'/0` (identical to MetaMask et al.), Bitcoin `m/84'` native segwit, Solana `m/44'/501'/0'/0'` (Phantom's default). Import validates the phrase (`normalizeMnemonic`, any 12/15/18/21/24-word length) and wraps the **imported seed** in the same hybrid vault as a generated one; funds do not move and the phrase keeps working in the originating wallet.
- **Fail-closed**: import is only possible while the account has no wallet at all — a registered wallet OR an already-saved envelope (interrupted creation) rejects with `wallet_vault_exists`; nothing is reserved or saved. Invalid phrases reject with `invalid_mnemonic` before any reserve.
- Machine: `hooks/wallet-vault-machine.ts` gains `import` origin and `import_phrase` state (intro → import_phrase → enter_pin → working → home; success skips the phrase screen and the word challenge because the user already holds the phrase).
- UI: `WalletVaultFlow.tsx` — "Import an existing recovery phrase" secondary button on the intro, phrase entry screen with "only import a phrase you control / HASHPASS is not responsible" warnings and client-side validation, PIN-confirmation copy specific to import, cleared on background/lock like every other secret.
- **Setup-unavailable feedback**: `WalletVaultFlow` no longer returns `null` when `setupEnabled` is off or the environment is not development. It renders a notice explaining why the wizard is not offered (flag off / test-networks-only / already registered) plus a "Check again for wallet setup" button wired to the enrollment reload — the wizard is never silently hidden.
- Failure copy: `invalid_mnemonic`, `wallet_vault_exists`, `wallet_vault_missing` (points at the forgot-PIN rebuild path) added to `describeFailure`; strings for en/es/ko.
- pin.sql harness fixed after its first real run: the direct second-row INSERT needed a `bytea` cast, and the physical PK proof now runs as the schema owner with the stronger fact asserted separately that `service_role` cannot write `user_pin` directly at all (permission denied — only the granted functions can).

## Execution log — 2026-10-24: wallet UX round — balance/send/receive, help drawer, import, 503 diagnosability

- **Single-PIN DB harness green** (`pnpm -F @hashpass/wallet test:db:pin`): one verifier per account, no second PIN from any surface, change needs the current PIN, wrong current counts as a guess, 5 wrong guesses lock, recovery replaces + clears and still ends with one verifier, and neither `service_role` nor `authenticated` can touch the table directly (role-split assertions: behavior via the granted functions under `service_role`, table state as schema owner — `service_role` cannot even SELECT `user_wallet`-style direct reads of `user_pin`).
- **Wallet UI**: Assets tab now leads with a **general balance card** (honest "—" placeholder, test-network note, never a fake zero), **Send** (disabled with an explicit "arrives with signed transactions after the security rollout" note — no signing flow exists to gate yet) and **Receive** (expands to the real registered addresses per chain with the wrong-network warning, or a "set up your wallet" prompt), plus a structured empty-state **recent activity** list. `WalletEnrollmentView` reports its loaded row upward so the balance card knows the registration state without a second request (ref-based callback, no reload loops).
- **Help & support drawer** (`components/wallet/WalletHelpDrawer.tsx`), per user feedback NOT a fourth tab: a floating "?" button opens an internal support drawer — frosted blur backdrop (web `backdropFilter`, plain dim on native), a grab bar at the top that toggles sheet ↔ full-height expand mode, category tabs (Security / PIN & recovery / Wallets & networks / Support), expandable wiki-style items, and **semantic search** over the FAQ corpus: query terms are scored against questions/answers with a synonym map (`password`→PIN, `lost backup`→recovery phrase, `import`→BIP-39/MetaMask/Ledger/Phantom…), so people's words find the answers even when they never match literally. Tested (`tests/wallet/help-drawer.test.tsx`).
- **Better Auth getSession abort** (`packages/auth/src/providers/better-auth.ts`): better-fetch's `fetchOptions.timeout` (7s) aborts a cold/slow backend with `DOMException: The operation was aborted`. That is a transport state, not an auth verdict: getSession now classifies abort-like errors (`isAbortLikeError`), retries once after 750ms (cold dev-server first hit), and on the second abort keeps the last-known/stored session with a warn-level log instead of an error-level one. The stored-session fallback (no logout broadcast on transport failure) was already correct.
- **`/api/wallet/enrollment` 503 diagnosability**: the GET collapsed "Supabase query failed" and "registry user has no `user_wallet` row" into one opaque 503. Now: query errors log the reason (message only, no payloads) and stay 503; a missing row is provisioning drift, not an outage → 409 `wallet_not_enrolled`, which the client surfaces as its own message ("Your account is missing its wallet record… contact support"). The local 503 seen in dev still needs the server log/console to pin the exact cause — check the `[wallet/enrollment]` warn lines.
- i18n: `overview.*` balance/send/receive/activity keys, `faq.*` corpus, `help.*` drawer keys, `enrollment.notEnrolled` — en/es/ko.

## Execution log — 2026-10-24 (later): unified card, reusable drawer base, security section, wizard-missing diagnosis

- **Unified overview card** (`WalletEnrollmentView.tsx` rewritten): the "Total balance / Send / Receive" card and the "READ ONLY / Your wallet. Your control." status card are now one section — READ ONLY badge + ownership title, balance block, Send (disabled, honest note) / Receive (expands to registered per-chain addresses with the wrong-network disclaimer), state-specific status text, the vault flow and a refresh link. Tests updated: Send asserted via its `ActionButton` (`disabled === true`) instead of absence; the registered addresses are behind the Receive toggle; refresh located via label text, not `findByType(Pressable)` (the balance actions render Pressables first).
- **Reusable drawer base** (`components/ui/DrawerSheet.tsx`), per mobile-platform standards: Material 3 / iOS-style **grabber pill only** (no "Expand/Shrink" text label, no chevron) in a 40pt grab area toggling standard sheet ↔ ~96% full height; frosted backdrop on web (`backdropFilter: blur(6px)` + `-webkit-` prefix), plain dim on native; fresh opens always start at standard height; screen-reader labels kept for every control (`expandLabel`/`shrinkLabel`/`closeLabel`); rounded top corners; ScrollView body with uniform padding and no negative margins (fixes the white-gap artifact). `WalletHelpDrawer` rewritten on top of it. Other app drawers (VersionDetailsModal, PrivacyTermsModal, QuickSettingsPanel…) are still on their own `Modal`s — migration to the base is open.
- **Security section at the bottom of the Assets view** (`wallet.tsx`): now a proper panel after "Recent activity" with a lock-icon header ("Security") and a **"Learn more" link in the top-right corner that opens the wallet help drawer** (`accessibilityRole="link"`, distinct from the accordion toggle so tests/a11y don't confuse them).
- **Missing setup wizard diagnosed and hardened**: the wizard can only render once the enrollment row loads AND `setupEnabled` is true — and `setupEnabled` requires `environment === 'development'` AND `HASHPASS_WALLET_SETUP_ENABLED === 'true'` (a server env flag that was **undocumented in `.env.example`**). The 503 the user saw locally (Supabase server env missing → mock client, or the lookup failing — see the `[wallet/enrollment]` console lines) leaves the card in the error state with no row, so no wizard section rendered at all while the Receive prompt still said "set up your wallet below". Fixes: (1) `HASHPASS_WALLET_SETUP_ENABLED` documented in `.env.example` with the local-dev value; (2) the error state now renders a prominent "Try again" `ActionButton` (a failed status check never removes the path back to the wizard; the plain Refresh link stays for the ready state); (3) the Receive prompt no longer promises "below" when no row loaded (`overview.receivePending`). Local resolution still needs the dev machine: set the Supabase server env + the setup flag, restart the dev server (also clears the stale Metro bundle), and check the `[wallet/enrollment]` log lines if 503 persists.
- Enrollment API test updated to the split statuses: missing `user_wallet` row → 409 `wallet_not_enrolled`, query error → 503 (both asserted).
- Verification: `npx jest tests/wallet tests/lib/pin-auth` — 15 suites / 111 tests green; locale JSON en/es/ko valid; `tsc --noEmit` clean for all touched wallet/drawer files (remaining errors are pre-existing typedRoutes noise in `AgendaTracker.tsx` / `meeting-detail.tsx`). One leftover `getStyles(colors)` call from the unified rewrite (declared with no params) fixed to `getStyles()`.
- i18n this round: `overview.securityTitle/learnMore/receivePending`, `enrollment.tryAgain` — en/es/ko.


### 2026-10-24 (migrations + drawer + env)
- **Root cause of the 503 and the missing setup wizard:** the core dev database had no `user_wallet` / `user_wallet_vault`. V097, V137 and V138 belong to no group in `packages/tools/scripts/config/database-profiles.json`, so the runner's `wallet`/`auth` groups never create them. They were applied directly with psql to `SUPABASE_DB_URL_DEV` and recorded in `public.hashpass_schema_migrations`. Result: 18 `user_wallet` rows (backfilled for the 18 registry users), `user_wallet_vault` and `reset_user_pin` present. **Open:** add the three files to a migration group (the edit to the `wallet` group was declined) so other environments can be provisioned by the runner.
- Local `.env` (gitignored) now has `HASHPASS_WALLET_SETUP_ENABLED=true` and a random `HASHPASS_VAULT_KEK`. `.env.example` documents the flag. Real environments still need the KEK provisioned through their secret store.
- `useAuth.ts`: Better Auth bootstrap timeout raised to 16s (covers the provider's 7s timeout + retry) and logged once, not once per hook mount.
- `DrawerSheet`: JS-driven entrance animation (no `useNativeDriver` warning on web), backdrop absolutely fills the modal (white-strip fix), grabber pill, `defaultHeight` prop ('content' default, 'medium'). The help drawer opens content-fit.
- `jest.setup.cjs`: `Animated` mock gained `Value`, `timing` and `parallel`.
- Verification: `npx jest tests/wallet tests/lib/pin-auth` gives 15 suites / 111 tests green.

### 2026-10-24 (release v1.9.142: create-only vault wizard)
- **Migrations**: new `database-profiles.json` groups `non-custodial-wallet` (V097/V137/V138), `chat-key-backup` (V075), `event-public-flags` (V109), all in `core-development`; V075 and V109 applied to dev. V125 (one-off BSL prod consolidation, needs staged `bsl_import*` schemas) intentionally NOT applied to dev.
- **Create-only**: import of external wallets removed from the machine, UI, copy and tests (security: HASHPASS does not handle externally created wallets; export only). `HybridWallet.importPhrase` still exists in `packages/wallet` but no UI reaches it.
- **Full-screen secure steps**: every step except `intro`/`home` (PIN, phrase, challenge, recovery) renders in a full-screen `Modal`, so nothing else is actionable during the checks.
- **Wallet detection**: the card derives its state from the enrollment row (registered -> "Wallet active" + menu; enrolled -> "No wallet yet" + Set up wallet; provisioning -> "Setup incomplete"). Refresh is quiet (`load(true)`) and the machine is keyed on owner/wallet ids, so a refresh no longer restarts an open wizard.
- **Card redesign**: top row with READ ONLY badge, refresh icon and three-dot menu (export phrase / change PIN / forgot PIN); Send/Receive with icons.
- **Guards**: type declarations moved to `*.types.ts`; hardcoded radii/colors replaced by `uiTokens`/`uiPalette` (design-system guard).
- **Open**: confirm on a restarted dev server that `/api/wallet/enrollment` returns 200 and the wizard runs end to end; provision `HASHPASS_VAULT_KEK` for real environments.
