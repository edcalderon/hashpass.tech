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
  it('publishes an unclaimed profile as idle and allows meeting requests', () => {
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
      archivesRequests: false,
      status: 'idle',
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
      archivesRequests: false,
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

  it('keeps accepting requests in do-not-disturb mode but archives them', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: true,
      user_id: 'speaker-auth-user',
      is_accepting_meetings: true,
      do_not_disturb: true,
    })).toMatchObject({ status: 'dnd', isAcceptingMeetings: true, archivesRequests: true });
  });

  it('does not archive when a disabled profile still has the do-not-disturb flag', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: false,
      user_id: 'speaker-auth-user',
      do_not_disturb: true,
    })).toMatchObject({ status: 'inactive', archivesRequests: false });
  });

  it('never applies do-not-disturb to an unclaimed profile', () => {
    expect(getSpeakerDirectoryState({
      directory_visible: true,
      is_active: false,
      user_id: null,
      do_not_disturb: true,
    })).toMatchObject({ status: 'idle', archivesRequests: false });
  });
});
