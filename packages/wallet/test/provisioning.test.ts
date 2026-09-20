import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalletProvisioning } from '../src/provisioning.ts';
import { LocalWallet } from '../src/local-wallet.ts';
import { derivePublicWallet } from '../src/core.ts';
import type { WalletEnrollment, EnrollmentTransport } from '../src/enrollment.ts';
const scope = { environment: 'development' as const, ownerId: 'owner', walletId: 'wallet' };
const fixture = derivePublicWallet('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 'testnet');
function setup() {
  let row: WalletEnrollment = { scope, state: 'enrolled', operationId: null, wallet: null, network: null, setupEnabled: true };
  const blobs = new Map<string, string>(); let failRegistration = false;
  const local = new LocalWallet(scope, { async read(key) { return blobs.get(key) ?? null; }, async compareAndSwap(key, expected, next) { if ((blobs.get(key) ?? null) !== expected) return false; blobs.set(key, next); return true; } });
  let registrations = 0;
  const api: EnrollmentTransport = {
    async load() { return row; },
    async reserve(_walletId, operationId) { row = { ...row, state: 'provisioning', operationId, network: 'testnet' }; return row; },
    async register(_id, _op, wallet) {
      registrations++; if (failRegistration) throw new Error('offline');
      row = { ...row, wallet, state: 'registered' }; return row;
    },
  };
  return { local, api, initial: row, setRow: (value: WalletEnrollment) => { row = value; },
    fail: () => { failRegistration = true; }, recover: () => { failRegistration = false; },
    registrations: () => registrations };
}
const password = 'public provisioning test password';
test('registration retry uses the persisted seed instead of creating a replacement', async () => {
  const s = setup(); s.fail();
  const flow = new WalletProvisioning(s.initial, s.local, s.api, () => 'operation');
  await assert.rejects(flow.provision(password), /offline/);
  const original = await s.local.unlock(password);
  s.recover();
  const result = await flow.provision(password);
  assert.deepEqual(result.wallet, original);
  assert.equal(s.registrations(), 2);
});
test('registered wallet on a new device requires recovery, not new generation', async () => {
  const s = setup(); s.setRow({ ...s.initial, state: 'registered', network: 'testnet', wallet: fixture });
  const flow = new WalletProvisioning(s.initial, s.local, s.api, () => 'operation');
  await assert.rejects(flow.provision(password), /recovery_required/);
  assert.equal(await s.local.exists(), false);
});
test('changed account or cancelled load cannot reserve or generate', async () => {
  const s = setup();
  s.setRow({ ...s.initial, scope: { ...scope, ownerId: 'other-owner' } });
  const flow = new WalletProvisioning(s.initial, s.local, s.api, () => 'operation');
  await assert.rejects(flow.provision(password), /wallet_identity_changed/);
  s.setRow(s.initial);
  const pending = flow.provision(password); flow.lock();
  await assert.rejects(pending, /wallet_locked/);
  assert.equal(await s.local.exists(), false);
});

test('retries a committed reservation after response loss using durable intent', async () => {
  const s = setup();
  const reserve = s.api.reserve;
  let lost = true;
  const operations: string[] = [];
  s.api.reserve = async (id, op) => {
    operations.push(op);
    const row = await reserve(id, op);
    if (lost) { lost = false; throw new Error('response_lost'); }
    return row;
  };
  await assert.rejects(new WalletProvisioning(s.initial, s.local, s.api, () => 'original').provision(password), /response_lost/);
  assert.equal(await s.local.exists(), false);
  const result = await new WalletProvisioning(await s.api.load(), s.local, s.api, () => 'replacement').provision(password);
  assert.equal(result.state, 'registered');
  assert.deepEqual(operations, ['original', 'original']);
});
test('another device cannot resume provisioning without the original intent', async () => {
  const s = setup();
  s.setRow({ ...s.initial, state: 'provisioning', network: 'testnet', operationId: 'another-device' });
  await assert.rejects(new WalletProvisioning(s.initial, s.local, s.api, () => 'new').provision(password), /wallet_setup_interrupted/);
  assert.equal(await s.local.exists(), false);
});
test('consumed intent cannot generate replacement keys if the vault is missing', async () => {
  const s = setup();
  await s.local.reservationOperation('original');
  await s.api.reserve(scope.walletId, 'original');
  await s.local.claimReservation('original');
  await assert.rejects(new WalletProvisioning(await s.api.load(), s.local, s.api, () => 'new').provision(password), /wallet_setup_interrupted/);
  assert.equal(await s.local.exists(), false);
});
