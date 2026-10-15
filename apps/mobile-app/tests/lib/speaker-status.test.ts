import { getSpeakerDirectoryState, isClaimedActiveSpeaker } from '../../lib/speaker-status';

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

describe('getSpeakerDirectoryState', () => {
  it('publishes an unclaimed profile as pending and allows meeting requests', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: false,
      user_id: null,
      is_accepting_meetings: false,
    })).toEqual({
      isPublished: true,
      isClaimed: false,
      isNetworkingActive: false,
      isAcceptingMeetings: true,
      status: 'pending',
    });
  });

  it('marks a claimed and enabled speaker as active', () => {
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

  it('keeps a claimed speaker inactive when they disable their profile', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: false,
      user_id: 'speaker-auth-user',
      is_accepting_meetings: true,
    })).toMatchObject({
      isClaimed: true,
      isNetworkingActive: false,
      isAcceptingMeetings: false,
      status: 'inactive',
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
