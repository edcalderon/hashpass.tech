import test from 'node:test';
import assert from 'node:assert/strict';
import { getSimulatedOffline, saveSimulatedOffline } from '../src/storage.ts';

test('simulated offline survives module reload and can be switched off', async () => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  try {
    assert.equal(getSimulatedOffline(), false);
    saveSimulatedOffline(true);
    const reloaded = await import('../src/storage.ts?reload');
    assert.equal(reloaded.getSimulatedOffline(), true);
    reloaded.saveSimulatedOffline(false);
    assert.equal(getSimulatedOffline(), false);
    values.set('localpass-simulated-offline', 'invalid');
    assert.equal(getSimulatedOffline(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('blocked storage does not prevent the first render', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try { assert.equal(getSimulatedOffline(), false); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
