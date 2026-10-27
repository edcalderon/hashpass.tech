import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGate } from '../src/sma/gate.ts';

test('a first visit opens setup, and closing it shows the public landing instead of the dashboard', () => {
  assert.equal(resolveGate('setup', false, false), 'setup');
  assert.equal(resolveGate('setup', false, true), 'landing');
});

test('the dashboard only appears once a local Companion exists', () => {
  assert.equal(resolveGate('ready', true, false), 'workspace');
  assert.equal(resolveGate('ready', true, true), 'workspace');
});

test('a read failure still lands on the landing page when setup is dismissed', () => {
  assert.equal(resolveGate('setup', false, true), 'landing');
  assert.equal(resolveGate('loading', false, true), 'loading');
});

test('an inconsistent ready state without an archive never reaches the dashboard', () => {
  assert.equal(resolveGate('ready', false, false), 'setup');
  assert.equal(resolveGate('ready', false, true), 'landing');
});
