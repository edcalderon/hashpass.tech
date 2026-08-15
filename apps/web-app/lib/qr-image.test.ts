import test from 'node:test';
import assert from 'node:assert/strict';
import * as qrImage from './qr-image';

test('reserves the configured number of QR modules as a quiet zone in PNG exports', () => {
  const getLayout = (qrImage as { qrExportLayout?: (input: {
    imageSize: number;
    moduleCount: number;
    marginModules: number;
  }) => { codeSize: number; padding: number } }).qrExportLayout;

  assert.equal(typeof getLayout, 'function');
  const layout = getLayout!({ imageSize: 1024, moduleCount: 25, marginModules: 4 });

  assert.equal(layout.codeSize + layout.padding * 2, 1024);
  assert.ok(Math.abs((layout.padding / layout.codeSize) - (4 / 25)) < 0.01);
});
