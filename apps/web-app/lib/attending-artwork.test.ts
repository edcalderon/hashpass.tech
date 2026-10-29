import assert from 'node:assert/strict';
import test from 'node:test';
import { getAttendingArtworkHeadline } from './attending-artwork';

test('attending artwork uses only the active locale headline', () => {
  const spanish = {
    pastEvent: false,
    intentions: { upcoming: 'VOY A ASISTIR', past: 'ESTUVE ALLÍ', emptyName: 'Tu nombre' },
  };
  const english = {
    pastEvent: false,
    intentions: { upcoming: 'I’M ATTENDING', past: 'I WAS THERE', emptyName: 'Your name' },
  };

  assert.equal(getAttendingArtworkHeadline(spanish), 'VOY A ASISTIR');
  assert.equal(getAttendingArtworkHeadline(english), 'I’M ATTENDING');
});

test('past attending artwork uses the active locale past headline', () => {
  assert.equal(getAttendingArtworkHeadline({
    pastEvent: true,
    intentions: { upcoming: 'VOY A ASISTIR', past: 'ESTUVE ALLÍ', emptyName: 'Tu nombre' },
  }), 'ESTUVE ALLÍ');
});
