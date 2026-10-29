import assert from 'node:assert/strict';
import test from 'node:test';
import { getAttendingArtworkPublishEventUrl } from './attending-url';

test('publishes BSL artwork against the tenant route from mirrored Club pages', () => {
  assert.equal(
    getAttendingArtworkPublishEventUrl('bsl'),
    'https://bsl.hashpass.tech/attending/bsl/',
  );
});

test('publishes community artwork against the generic Club landing', () => {
  assert.equal(
    getAttendingArtworkPublishEventUrl('community', true),
    'https://hashpass.club/attendings/',
  );
});
