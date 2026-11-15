# Wallet & Contacts authenticator protection

Tracked by https://github.com/hashpass-tech/hashpass.tech/issues/616 (under #455).

Wallet and Contacts share the Wallet & Contacts sidebar item. Existing contacts links preserve
card parameters and redirect into its Contacts tab. Each visit checks the PIN and then requires
an authenticator code. Leaving the route, account changes and logout clear the authenticator
session. Backgrounding locks an unlocked wallet unless an authenticator challenge is active;
while that challenge is open, the pending flow stays mounted for an authenticator-app handoff.
Content closes when the five-minute PIN proof expires.

## Enrollment and verification

`GET /api/setup/authenticator` returns only `{ enabled }`. Bearer-authenticated POST actions:

- `begin`: requires a fresh wallet PIN proof. Returns a locally rendered QR URI and manual key.
  An unfinished setup resumes the same secret until its ten-minute expiry; enabled factors
  cannot be replaced through this endpoint.
- `confirm`: requires the PIN proof and current authenticator code. Only successful confirmation
  activates protection. Returns eight one-use recovery codes, shown once for private backup.
- `verify`: consumes a current authenticator code or a single-use recovery code and issues
  an actor- and scope-bound proof. `access` lasts five minutes; `critical` lasts sixty seconds.

TOTP uses RFC 6238, SHA-1, six digits and thirty-second periods, compatible with Google
Authenticator and Authy. Only server time determines validity, with one period of clock skew.
The database atomically rejects consumed counters and concurrent replays and locks verification
for five minutes after five failed attempts. Recovery code hashes are bound to the actor.
PIN reset does not remove or replace the authenticator. Keep recovery codes offline; factor
replacement and recovery-code regeneration are not exposed by this change.

Wallet API reads require authenticator proof; critical writes and contacts mutations require a
critical proof in addition to the existing PIN authorization. Wallet enrollment metadata can
be read using a critical authenticator proof during PIN recovery, without releasing the vault.
Vault recovery still requires the emailed recovery proof and recovery phrase. A fresh code is
requested for each sensitive UI flow. Multi-request wallet operations use the same short-lived
critical proof; proofs are not transaction-bound, single-use transaction authorizations.
Sending transactions remains disabled. Before enabling sending, add a server-side transaction
challenge bound to the exact recipient, chain and amount, consumed atomically at submission.

## Deployment

Apply `db/migrations/V175__authenticator_security.sql` before deploying the API and client.
Provision `HASHPASS_TOTP_KEY` on the API only: a random, stable 32-byte key encoded as 64 hex
characters, separate from `HASHPASS_PIN_PEPPER` and `HASHPASS_VAULT_KEK`. Never set a public Expo
variable for it, log it, or put it in client configuration. Preserve and back up the key; changing
it without re-encrypting stored secrets invalidates enrolled authenticators and recovery hashes.
Missing key or migration fails closed. Configure both step-up headers in API Gateway CORS
(the Terraform module defaults include them). Roll out the migration, key, API and client as a
coordinated security change: older clients cannot satisfy the mandatory authenticator boundary.
Existing users enroll individually on their next visit; administrators cannot enroll their devices
on their behalf. This code change does not migrate or enroll production users automatically.

Validation: `tests/lib/authenticator.test.ts`, `tests/api/authenticator.test.ts`, existing protected
API suites and `db/tests/authenticator.sql`. The SQL fixture runs only in a disposable database.
