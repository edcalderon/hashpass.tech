import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDestination, validateVisualConfig } from './validation';
import { DEFAULT_QR_VISUAL } from './types';

test('accepts public HTTP(S) destinations', () => {
  assert.equal(validateDestination('https://example.com/a').host, 'example.com');
  assert.equal(validateDestination('http://example.org').protocol, 'http:');
});

const UNSAFE_DESTINATIONS = [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///tmp/a',
  'not a url',
  'http://localhost/a',
  'http://LOCALHOST/a',
  'http://sub.localhost/a',
  'http://127.0.0.1',
  'http://0.0.0.0',
  'http://10.0.0.1',
  'http://172.16.0.1',
  'http://192.168.1.1',
  'http://169.254.169.254/latest', // cloud metadata (AWS/GCP/Azure IMDS)
  'http://metadata.google.internal',
  'http://100.64.0.1', // carrier-grade NAT / shared address space
  'http://user:pass@example.com',
  'ftp://example.com',
];

for (const value of UNSAFE_DESTINATIONS) {
  test(`rejects unsafe destination: ${value}`, () => {
    assert.throws(() => validateDestination(value));
  });
}

test('accepts a public IP that only superficially resembles a private one', () => {
  // 172.32.x.x is outside the 172.16.0.0/12 private range (16-31 only).
  assert.doesNotThrow(() => validateDestination('http://172.32.0.1'));
});

test('enforces minimum contrast between foreground and background', () => {
  assert.throws(() => validateVisualConfig({ ...DEFAULT_QR_VISUAL, foreground: '#eeeeee', background: '#ffffff' }));
});

test('rejects an out-of-range quiet zone or logo size', () => {
  assert.throws(() => validateVisualConfig({ ...DEFAULT_QR_VISUAL, margin: 1 }));
  assert.throws(() => validateVisualConfig({ ...DEFAULT_QR_VISUAL, margin: 20 }));
  assert.throws(() => validateVisualConfig({ ...DEFAULT_QR_VISUAL, logoSize: 5 }));
  assert.throws(() => validateVisualConfig({ ...DEFAULT_QR_VISUAL, logoSize: 30 }));
});

test('upgrades error correction to H whenever a center logo is enabled', () => {
  const result = validateVisualConfig({ ...DEFAULT_QR_VISUAL, logo: true, errorCorrection: 'M' });
  assert.equal(result.errorCorrection, 'H');
});

test('leaves error correction untouched when no logo is present', () => {
  const result = validateVisualConfig({ ...DEFAULT_QR_VISUAL, logo: false, errorCorrection: 'M' });
  assert.equal(result.errorCorrection, 'M');
});
