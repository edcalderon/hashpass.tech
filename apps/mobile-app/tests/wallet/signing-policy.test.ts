import { getSigningBlocker, type SoftwareWalletEvidence } from '../../lib/wallet/signing-policy';

const ready = (): SoftwareWalletEvidence => ({
  walletId: 'wallet-a', vaultPersisted: true,
  backup: { walletId: 'wallet-a', phraseVerified: true, exportRestored: true },
  unlock: { walletId: 'wallet-a', method: 'password', expiresAt: 2000 },
});

describe('software wallet signing prerequisites', () => {
  it('fails closed before creation and durable persistence', () => {
    expect(getSigningBlocker(null, 1000)).toBe('wallet_missing');
    expect(getSigningBlocker({ ...ready(), vaultPersisted: false }, 1000)).toBe('vault_missing');
  });
  it('requires both phrase verification and an actual export recovery check', () => {
    for (const backup of [undefined, { ...ready().backup!, phraseVerified: false },
      { ...ready().backup!, exportRestored: false }, { ...ready().backup!, walletId: 'other' }]) {
      expect(getSigningBlocker({ ...ready(), backup }, 1000)).toBe('backup_required');
    }
  });
  it('rejects absent, expired, malformed and other-wallet unlock evidence', () => {
    for (const unlock of [undefined, { ...ready().unlock!, expiresAt: 1000 },
      { ...ready().unlock!, expiresAt: NaN }, { ...ready().unlock!, expiresAt: Infinity },
      { ...ready().unlock!, walletId: 'other' }]) {
      expect(getSigningBlocker({ ...ready(), unlock }, 1000)).toBe('unlock_required');
    }
    expect(getSigningBlocker(ready(), NaN)).toBe('unlock_required');
  });
  it('does not treat login or TOTP verification as local key protection', () => {
    const evidence = { ...ready(), unlock: { ...ready().unlock!, method: 'totp' } };
    expect(getSigningBlocker(evidence as SoftwareWalletEvidence, 1000)).toBe('unlock_required');
  });
  it('accepts verified recovery and a fresh wallet-bound unlock, then expires', () => {
    expect(getSigningBlocker(ready(), 1999)).toBeNull();
    expect(getSigningBlocker(ready(), 2000)).toBe('unlock_required');
    expect(getSigningBlocker({ ...ready(), unlock: { ...ready().unlock!, method: 'passkey' } }, 1000)).toBeNull();
  });
});
