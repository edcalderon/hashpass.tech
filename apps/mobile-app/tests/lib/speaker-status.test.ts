import { isClaimedActiveSpeaker } from '../../lib/speaker-status';

describe('isClaimedActiveSpeaker', () => {
  it.each([
    [{ is_active: true, user_id: 'speaker-auth-user' }, true],
    [{ is_active: true, user_id: null }, false],
    [{ is_active: true, user_id: '   ' }, false],
    [{ is_active: false, user_id: 'speaker-auth-user' }, false],
    [{ is_active: null, user_id: 'speaker-auth-user' }, false],
  ])('returns %s for %o', (speaker, expected) => {
    expect(isClaimedActiveSpeaker(speaker)).toBe(expected);
  });
});
