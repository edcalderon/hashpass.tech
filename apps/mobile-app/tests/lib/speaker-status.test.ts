import { getSpeakerDirectoryState, isClaimedActiveSpeaker } from '../../lib/speaker-status';

describe('isClaimedActiveSpeaker', () => {
  it.each([
    [{ is_active: true, user_id: 'speaker-auth-user' }, true],
    [{ is_active: true, user_id: null }, true],
    [{ is_active: true, user_id: '   ' }, true],
    [{ is_active: false, user_id: 'speaker-auth-user' }, false],
    [{ is_active: null, user_id: 'speaker-auth-user' }, false],
  ])('returns %s for %o', (speaker, expected) => {
    expect(isClaimedActiveSpeaker(speaker)).toBe(expected);
  });
});

describe('getSpeakerDirectoryState', () => {
  it('publishes an unclaimed profile and allows meeting requests when the organizer enables them', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: true,
      user_id: null,
      is_accepting_meetings: true,
    })).toEqual({
      isPublished: true,
      isClaimed: false,
      isNetworkingActive: true,
      isAcceptingMeetings: true,
      status: 'active',
    });
  });

  it('allows networking only after a claimed speaker opts into meetings', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: true,
      user_id: 'speaker-auth-user',
      is_accepting_meetings: true,
    })).toEqual({
      isPublished: true,
      isClaimed: true,
      isNetworkingActive: true,
      isAcceptingMeetings: true,
      status: 'active',
    });
  });

  it('keeps an unclaimed profile private when it is not published', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: false,
      is_active: false,
      user_id: null,
      is_accepting_meetings: false,
    }).status).toBe('private');
  });
});
