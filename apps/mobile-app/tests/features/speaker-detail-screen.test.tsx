/// <reference types="jest" />

import React from 'react';

// This screen is deliberately tested at its public boundary: the event API.
// Keeping the surrounding native/UI dependencies small makes the regression
// test deterministic while still rendering the real screen and invoking its
// real request handlers.
const { act, create } = require('react-test-renderer');

const mockApiRequest = jest.fn();
const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowInfo = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockGetUserPassInfo = jest.fn();

let mockParams: { id?: string } = { id: 'speaker-1' };
let mockEventSpeakers: Array<Record<string, unknown>> = [];
let mockAuthState = {
  user: { email: 'requester@example.test' },
  isLoggedIn: true,
  dbUserId: 'requester-1',
};

const mockEvent = {
  id: 'bsl',
  speakers: mockEventSpeakers,
};

const mockColors = {
  primary: '#d93025',
  secondary: '#1f2937',
  surface: '#f5f5f5',
  divider: '#e5e7eb',
  background: { default: '#fafafa', paper: '#ffffff', primary: '#fafafa' },
  success: { main: '#10b981' },
  warning: { main: '#f59e0b' },
  error: { main: '#ef4444' },
  text: { primary: '#111827', secondary: '#4b5563' },
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({ event: { ...mockEvent, speakers: mockEventSpeakers } }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false, colors: mockColors }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
  }),
}));

jest.mock('@contexts/BalanceContext', () => ({
  useBalance: () => ({ refreshBalance: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: { request: (...args: unknown[]) => mockApiRequest(...args) },
  eventApiPath: (eventId: string, resource: string) => `events/${eventId}/${resource}`,
}));

jest.mock('../../lib/pass-system', () => ({
  passSystemService: { getUserPassInfo: (...args: unknown[]) => mockGetUserPassInfo(...args) },
}));

jest.mock('../../components/SpeakerAvatar', () => 'SpeakerAvatar');
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../components/PassesDisplay', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return ({ onRequestPress }: { onRequestPress: () => void }) => (
    <TouchableOpacity testID="request-meeting" onPress={onRequestPress}>
      <Text>Request meeting</Text>
    </TouchableOpacity>
  );
});
jest.mock('@lib/copilot-shim', () => ({
  CopilotStep: ({ children }: { children: React.ReactNode }) => children,
  walkthroughable: (Component: React.ComponentType) => Component,
}));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/string-utils', () => ({
  getSpeakerAvatarUrl: (name: string) => `avatar:${name}`,
  getSpeakerLinkedInUrl: (name: string) => `linkedin:${name}`,
  getSpeakerTwitterUrl: (name: string) => `twitter:${name}`,
  resolveSpeakerImage: (image: string | undefined, name: string) => image || `fallback:${name}`,
}));

import SpeakerDetail from '../../app/events/[eventSlug]/speakers/[id]';

const speaker = {
  id: 'speaker-1',
  name: 'Ada Lovelace',
  title: 'Computing Pioneer',
  company: 'Analytical Engine',
  user_id: 'speaker-user-1',
  is_active: true,
};

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function defaultApiResponse(path: string, options?: { method?: string }) {
  if (path === 'events/bsl/speakers/speaker-1') {
    return Promise.resolve({ success: true, data: { data: speaker } });
  }
  if (path === 'events/bsl/meetings/limits') {
    return Promise.resolve({
      success: true,
      data: { data: { pass_type: 'business', total_requests: 0, remaining_requests: 3, max_requests: 3 } },
    });
  }
  if (path === 'events/bsl/meetings/requests' && options?.method === 'POST') {
    return Promise.resolve({ success: true, data: { data: { request_id: 'request-1' } } });
  }
  return Promise.resolve({ success: true, data: { data: [] } });
}

function findTextPressTarget(renderer: any, label: string) {
  const text = renderer.root.findAll(
    (node: any) => node.type === 'Text' && node.props.children === label,
  )[0];
  expect(text).toBeDefined();
  return text.parent;
}

function findPressableAncestor(node: any) {
  let current = node;
  while (current && typeof current.props?.onPress !== 'function') current = current.parent;
  expect(current).toBeDefined();
  return current;
}

function textContent(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textContent).join('');
}

describe('speaker detail screen', () => {
  beforeEach(() => {
    mockParams = { id: 'speaker-1' };
    mockEventSpeakers = [];
    mockAuthState = {
      user: { email: 'requester@example.test' },
      isLoggedIn: true,
      dbUserId: 'requester-1',
    };
    mockApiRequest.mockReset();
    mockApiRequest.mockImplementation(defaultApiResponse);
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockShowInfo.mockReset();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockGetUserPassInfo.mockReset();
    mockGetUserPassInfo.mockResolvedValue({ pass_type: 'business' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the loading view only until the event API resolves, then renders the speaker', async () => {
    let resolveSpeaker!: (value: unknown) => void;
    const speakerResponse = new Promise((resolve) => {
      resolveSpeaker = resolve;
    });
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) =>
      path === 'events/bsl/speakers/speaker-1'
        ? speakerResponse
        : defaultApiResponse(path, options),
    );

    let renderer: any;
    act(() => {
      renderer = create(<SpeakerDetail />);
    });
    expect(renderer.root.findByType('LoadingScreen').props.message).toBe('speakerView.loadingSpeakerDetails');

    await act(async () => {
      resolveSpeaker({ success: true, data: { data: speaker } });
      await flushPromises();
    });

    expect(renderer.root.findByProps({ children: 'Ada Lovelace' })).toBeTruthy();
    expect(mockApiRequest).toHaveBeenCalledWith('events/bsl/speakers/speaker-1', { skipEventSegment: true });

    await act(async () => renderer.unmount());
  });

  it('shows an inactive status for an unclaimed speaker, even when its legacy record is enabled', async () => {
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) =>
      path === 'events/bsl/speakers/speaker-1'
        ? Promise.resolve({
          success: true,
          data: { data: { ...speaker, user_id: null, is_active: true } },
        })
        : defaultApiResponse(path, options),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
    });

    expect(renderer.root.findByProps({ children: 'speakerView.inactive' })).toBeTruthy();
    await act(async () => renderer.unmount());
  });

  it('recovers from an event API error with the configured speaker instead of remaining in loading', async () => {
    mockEventSpeakers = [{ ...speaker, image: 'ada.png' }];
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) =>
      path === 'events/bsl/speakers/speaker-1'
        ? Promise.reject(new Error('network unavailable'))
        : defaultApiResponse(path, options),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
    });

    expect(renderer.root.findByProps({ children: 'Ada Lovelace' })).toBeTruthy();
    expect(() => renderer.root.findByType('LoadingScreen')).toThrow();
    expect(mockShowError).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it('uses the configured speaker when the event API cannot find the requested record', async () => {
    mockEventSpeakers = [{ ...speaker, image: 'ada.png' }];
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) =>
      path === 'events/bsl/speakers/speaker-1'
        ? Promise.resolve({ success: true, data: { data: null } })
        : defaultApiResponse(path, options),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
    });

    expect(renderer.root.findByProps({ children: 'Ada Lovelace' })).toBeTruthy();
    expect(mockShowError).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it('validates request capacity with the event limits API before submitting a meeting request', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
    });

    // A fresh limits check is required at submission time: a prior screen load
    // cannot prove that another request did not consume the final slot.
    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/bsl/meetings/limits') {
        return Promise.resolve({
          success: true,
          data: { data: { pass_type: 'business', total_requests: 3, remaining_requests: 0, max_requests: 3 } },
        });
      }
      return defaultApiResponse(path, options);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'request-meeting' }).props.onPress();
    });
    expect(
      renderer.root.findAllByType('Modal').some((modal: any) => modal.props.visible),
    ).toBe(true);

    await act(async () => {
      findTextPressTarget(renderer, 'meetingRequestModal.sendRequest').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('events/bsl/meetings/limits', {
      skipEventSegment: true,
    });
    expect(mockGetUserPassInfo).not.toHaveBeenCalled();
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      'events/bsl/meetings/requests',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockShowError).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('request'),
    );

    await act(async () => renderer.unmount());
  });

  it('submits a meeting request after the event limits API confirms capacity', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
    });

    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/bsl/meetings/limits') {
        return Promise.resolve({
          success: true,
          data: { data: { pass_type: 'business', total_requests: 0, remaining_requests: 3, max_requests: 3 } },
        });
      }
      return defaultApiResponse(path, options);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'request-meeting' }).props.onPress();
    });

    await act(async () => {
      findTextPressTarget(renderer, 'meetingRequestModal.sendRequest').props.onPress();
      await flushPromises();
    });

    const limitsCall = mockApiRequest.mock.calls.findIndex(
      ([path]: [string]) => path === 'events/bsl/meetings/limits',
    );
    const requestCall = mockApiRequest.mock.calls.findIndex(
      ([path, options]: [string, { method?: string }]) =>
        path === 'events/bsl/meetings/requests' && options?.method === 'POST',
    );
    expect(limitsCall).toBeGreaterThanOrEqual(0);
    expect(requestCall).toBeGreaterThanOrEqual(0);
    expect(limitsCall).toBeLessThan(requestCall);
    expect(mockApiRequest).toHaveBeenCalledWith(
      'events/bsl/meetings/requests',
      expect.objectContaining({
        skipEventSegment: true,
        method: 'POST',
        body: expect.objectContaining({
          speakerId: 'speaker-1',
          speakerName: 'Ada Lovelace',
          requesterName: 'requester@example.test',
        }),
      }),
    );
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Meeting Request Sent! 🎉',
      expect.stringContaining('Ada Lovelace'),
    );

    await act(async () => renderer.unmount());
  });

  it('lets the speaker confirm an incoming request only after choosing an event-scoped compatible slot', async () => {
    const incomingRequest = {
      id: 'request-incoming-1',
      _direction: 'incoming',
      status: 'pending',
      speaker_id: 'speaker-user-1',
      speaker_name: 'Ada Lovelace',
      requester_id: 'requester-2',
      requester_name: 'Casey Requester',
      duration_minutes: 30,
      meeting_type: 'networking',
      message: 'Could we discuss the event?',
      created_at: '2026-07-30T09:00:00.000Z',
      expires_at: '2026-08-06T09:00:00.000Z',
    };
    const selectedSlot = '2026-07-30T15:00:00.000Z';
    mockAuthState = {
      user: { email: 'ada@example.test' },
      isLoggedIn: true,
      dbUserId: 'speaker-user-1',
    };
    mockApiRequest.mockImplementation((path: string, options?: { method?: string; params?: Record<string, unknown> }) => {
      if (path === 'events/bsl/speakers/speaker-1') {
        return Promise.resolve({ success: true, data: { data: speaker } });
      }
      if (path === 'events/bsl/meetings/limits') {
        return Promise.resolve({
          success: true,
          data: { data: { pass_type: 'business', total_requests: 0, remaining_requests: 3, max_requests: 3 } },
        });
      }
      if (path === 'events/bsl/meetings/requests/slots') {
        return Promise.resolve({ success: true, data: { data: [{ slot_time: selectedSlot, duration_minutes: 30 }] } });
      }
      if (path === 'events/bsl/meetings/requests' && options?.method === 'PATCH') {
        return Promise.resolve({
          success: true,
          data: { data: { success: true, meeting_id: 'meeting-1', start_time: selectedSlot } },
        });
      }
      if (path === 'events/bsl/meetings/requests') {
        return Promise.resolve({ success: true, data: { data: [incomingRequest] } });
      }
      return defaultApiResponse(path, options);
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
      await flushPromises();
    });

    expect(renderer.root.findByProps({ children: 'Incoming Meeting Requests (1)' })).toBeTruthy();

    await act(async () => {
      const requesterLabel = renderer.root.findAll(
        (node: any) => node.type === 'Text' && textContent(node) === 'From Casey Requester',
      )[0];
      findPressableAncestor(requesterLabel).props.onPress();
      await flushPromises();
    });

    await act(async () => {
      findTextPressTarget(renderer, 'requestView.accept').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'events/bsl/meetings/requests/slots',
      {
        skipEventSegment: true,
        params: {
          speakerId: 'speaker-user-1',
          requesterId: 'requester-2',
          durationMinutes: 30,
        },
      },
    );

    const slotOption = renderer.root.findAll(
      (node: any) => typeof node.props?.onPress === 'function' && textContent(node).includes('30 minutes'),
    )[0];
    expect(slotOption).toBeDefined();

    await act(async () => {
      slotOption.props.onPress();
      await flushPromises();
    });

    await act(async () => {
      findTextPressTarget(renderer, 'Confirm meeting').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'events/bsl/meetings/requests',
      {
        skipEventSegment: true,
        method: 'PATCH',
        body: { requestId: 'request-incoming-1', action: 'accept', slotTime: selectedSlot },
      },
    );
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Request Accepted',
      'The meeting is confirmed and has been added to both schedules.',
    );
    expect(renderer.root.findByProps({ children: 'Open confirmed meeting and chat' })).toBeTruthy();

    await act(async () => renderer.unmount());
  });

  it('keeps acceptance safe when the event slot service cannot provide a compatible slot', async () => {
    const incomingRequest = {
      id: 'request-incoming-slots-fail', _direction: 'incoming', status: 'pending',
      speaker_id: 'speaker-user-1', speaker_name: 'Ada Lovelace',
      requester_id: 'requester-2', requester_name: 'Casey Requester', duration_minutes: 30,
      meeting_type: 'networking', created_at: '2026-07-30T09:00:00.000Z', expires_at: '2026-08-06T09:00:00.000Z',
    };
    mockAuthState = {
      user: { email: 'ada@example.test' }, isLoggedIn: true, dbUserId: 'speaker-user-1',
    };
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/bsl/speakers/speaker-1') return Promise.resolve({ success: true, data: { data: speaker } });
      if (path === 'events/bsl/meetings/limits') return Promise.resolve({ success: true, data: { data: { remaining_requests: 3, max_requests: 3 } } });
      if (path === 'events/bsl/meetings/requests/slots') return Promise.resolve({ success: false, error: 'No compatible slots' });
      if (path === 'events/bsl/meetings/requests') return Promise.resolve({ success: true, data: { data: [incomingRequest] } });
      return defaultApiResponse(path, options);
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      const requesterLabel = renderer.root.findAll(
        (node: any) => node.type === 'Text' && textContent(node) === 'From Casey Requester',
      )[0];
      findPressableAncestor(requesterLabel).props.onPress();
      await flushPromises();
    });
    await act(async () => {
      findTextPressTarget(renderer, 'requestView.accept').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('events/bsl/meetings/requests/slots', expect.objectContaining({
      skipEventSegment: true,
      params: expect.objectContaining({ speakerId: 'speaker-user-1', requesterId: 'requester-2' }),
    }));
    expect(mockShowError).toHaveBeenCalledWith('Slots Unavailable', 'No compatible slots');

    await act(async () => renderer.unmount());
  });

  it('lets the assigned speaker decline an incoming request through the event API', async () => {
    const incomingRequest = {
      id: 'request-incoming-2',
      _direction: 'incoming',
      status: 'pending',
      speaker_id: 'speaker-user-1',
      speaker_name: 'Ada Lovelace',
      requester_id: 'requester-2',
      requester_name: 'Casey Requester',
      duration_minutes: 15,
      meeting_type: 'networking',
      message: 'Could we discuss the event?',
      created_at: '2026-07-30T09:00:00.000Z',
      expires_at: '2026-08-06T09:00:00.000Z',
    };
    mockAuthState = {
      user: { email: 'ada@example.test' },
      isLoggedIn: true,
      dbUserId: 'speaker-user-1',
    };
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/bsl/speakers/speaker-1') {
        return Promise.resolve({ success: true, data: { data: speaker } });
      }
      if (path === 'events/bsl/meetings/limits') {
        return Promise.resolve({
          success: true,
          data: { data: { pass_type: 'business', total_requests: 0, remaining_requests: 3, max_requests: 3 } },
        });
      }
      if (path === 'events/bsl/meetings/requests' && options?.method === 'PATCH') {
        return Promise.resolve({ success: true, data: { data: { success: true } } });
      }
      if (path === 'events/bsl/meetings/requests') {
        return Promise.resolve({ success: true, data: { data: [incomingRequest] } });
      }
      return defaultApiResponse(path, options);
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      const requesterLabel = renderer.root.findAll(
        (node: any) => node.type === 'Text' && textContent(node) === 'From Casey Requester',
      )[0];
      findPressableAncestor(requesterLabel).props.onPress();
      await flushPromises();
    });
    await act(async () => {
      findTextPressTarget(renderer, 'requestView.decline').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'events/bsl/meetings/requests',
      {
        skipEventSegment: true,
        method: 'PATCH',
        body: { requestId: 'request-incoming-2', action: 'decline' },
      },
    );
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Request Declined',
      'The meeting request has been declined',
    );

    await act(async () => renderer.unmount());
  });

  it('lets the assigned speaker block an incoming requester through the event API', async () => {
    const incomingRequest = {
      id: 'request-incoming-3', _direction: 'incoming', status: 'pending',
      speaker_id: 'speaker-user-1', speaker_name: 'Ada Lovelace',
      requester_id: 'requester-3', requester_name: 'Blocked Requester',
      duration_minutes: 15, meeting_type: 'networking', message: 'Please meet.',
      created_at: '2026-07-30T09:00:00.000Z', expires_at: '2026-08-06T09:00:00.000Z',
    };
    mockAuthState = {
      user: { email: 'ada@example.test' }, isLoggedIn: true, dbUserId: 'speaker-user-1',
    };
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/bsl/speakers/speaker-1') {
        return Promise.resolve({ success: true, data: { data: speaker } });
      }
      if (path === 'events/bsl/meetings/limits') {
        return Promise.resolve({ success: true, data: { data: { remaining_requests: 3, max_requests: 3 } } });
      }
      if (path === 'events/bsl/meetings/requests' && options?.method === 'PATCH') {
        return Promise.resolve({ success: true, data: { data: { success: true } } });
      }
      if (path === 'events/bsl/meetings/requests') {
        return Promise.resolve({ success: true, data: { data: [incomingRequest] } });
      }
      return defaultApiResponse(path, options);
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      const requesterLabel = renderer.root.findAll(
        (node: any) => node.type === 'Text' && textContent(node) === 'From Blocked Requester',
      )[0];
      findPressableAncestor(requesterLabel).props.onPress();
      await flushPromises();
    });
    await act(async () => {
      findTextPressTarget(renderer, 'requestView.blockUser').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('events/bsl/meetings/requests', {
      skipEventSegment: true,
      method: 'PATCH',
      body: {
        requestId: 'request-incoming-3', action: 'block', requesterId: 'requester-3', reason: 'User has been blocked',
      },
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'User Blocked',
      'The user has been blocked and their request declined',
    );

    await act(async () => renderer.unmount());
  });

  it('cancels a requester meeting and refreshes the event-scoped request state', async () => {
    const request = {
      id: 'request-outgoing-1', status: 'pending', speaker_id: 'speaker-1',
      speaker_name: 'Ada Lovelace', requester_id: 'requester-1',
      requester_name: 'Requester', duration_minutes: 15, meeting_type: 'networking',
      created_at: '2026-07-30T09:00:00.000Z', expires_at: '2026-08-06T09:00:00.000Z',
    };
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/bsl/speakers/speaker-1') {
        return Promise.resolve({ success: true, data: { data: speaker } });
      }
      if (path === 'events/bsl/meetings/limits') {
        return Promise.resolve({ success: true, data: { data: { remaining_requests: 3, max_requests: 3 } } });
      }
      if (path === 'events/bsl/meetings/requests' && options?.method === 'PATCH') {
        return Promise.resolve({ success: true, data: { data: { success: true } } });
      }
      if (path === 'events/bsl/meetings/requests') {
        return Promise.resolve({ success: true, data: { data: [request] } });
      }
      return defaultApiResponse(path, options);
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<SpeakerDetail />);
      await flushPromises();
      await flushPromises();
    });
    await act(async () => {
      findPressableAncestor(
        renderer.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'speakerView.pendingStatus')[0],
      ).props.onPress();
      await flushPromises();
    });
    await act(async () => {
      findTextPressTarget(renderer, 'speakerView.cancelRequest').props.onPress();
      await flushPromises();
    });
    await act(async () => {
      findTextPressTarget(renderer, 'meetingRequestModal.confirmCancel').props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('events/bsl/meetings/requests', {
      skipEventSegment: true, method: 'PATCH',
      body: { requestId: 'request-outgoing-1', action: 'cancel' },
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Request Cancelled',
      'Your meeting request has been cancelled successfully.',
    );
    expect(mockApiRequest.mock.calls.filter(([path]: [string]) => path === 'events/bsl/meetings/limits').length).toBeGreaterThan(1);

    await act(async () => renderer.unmount());
  });
});
