/// <reference types="jest" />

import React from 'react';
import ProfileScreen from '../../app/(shared)/dashboard/profile';

const mockGetCurrentAdminAccess = jest.fn();
const mockApiGet = jest.fn();
const mockApiRequest = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();
const mockUpsert = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockAuthServiceGetUser = jest.fn();
const mockAuthServiceGetSession = jest.fn();
const profileUser = {
  id: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
  email: 'edward@hashpass.app',
  first_name: 'Edward',
  last_name: 'Calderón',
  created_at: '2026-05-02T00:00:00.000Z',
  user_metadata: { full_name: 'Edward Calderón' },
};
let mockAuthHookUser: typeof profileUser | null = profileUser;
let mountedRenderer: ReturnType<typeof create> | null = null;

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthHookUser, isLoading: false }),
}));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#bb1e10',
      background: { default: '#f6f6f8', paper: '#ffffff' },
      divider: '#d1d5db',
      text: { primary: '#1f2937', secondary: '#6b7280' },
    },
  }),
}));
jest.mock('@contexts/ScrollContext', () => ({ useScroll: () => ({ headerHeight: 0 }) }));
jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));
jest.mock('@hashpass/auth', () => ({
  authService: {
    getUser: () => mockAuthServiceGetUser(),
    getSession: () => mockAuthServiceGetSession(),
  },
}));
jest.mock('../../lib/admin-access', () => ({
  canLoadCurrentAdminAccess: () => true,
  getCurrentAdminAccess: (...args: unknown[]) => mockGetCurrentAdminAccess(...args),
}));
jest.mock('../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    request: (...args: unknown[]) => mockApiRequest(...args),
  },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
    from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
  },
}));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialIcons: 'MaterialIcons' }));

const { act, create } = require('react-test-renderer');

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const triggerPress = (node: any) => {
  const handler = node.props.onPress ?? node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Expected a pressable node');
  handler();
};

const pressText = (renderer: ReturnType<typeof create>, label: string) => {
  const textNodes = renderer.root.findAll((node: any) => node.props?.children === label);
  for (const textNode of textNodes) {
    let node: any = textNode;
    while (node) {
      if (typeof node.props?.onPress === 'function' || typeof node.props?.onClick === 'function') {
        triggerPress(node);
        return;
      }
      node = node.parent;
    }
  }
  throw new Error(`No pressable control found for ${label}`);
};

describe('ProfileScreen speaker information', () => {
  const speaker = {
    id: 'edward-calderon',
    name: 'Edward Calderón',
    title: 'Founder & CEO',
    company: 'Hashpass',
    imageUrl: 'https://cdn.hashpass.tech/speakers/edward.png',
  };
  const attendee = {
    fullName: 'Edward Calderón',
    title: 'Product Strategist',
    company: 'Hashpass Labs',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthHookUser = profileUser;
    mockAuthServiceGetUser.mockReturnValue(profileUser);
    mockAuthServiceGetSession.mockResolvedValue({ user: profileUser });
    mockGetCurrentAdminAccess.mockResolvedValue({
      globalRole: 'super_admin',
      globalRoles: ['super_admin'],
      eventRoles: [{ eventId: 'bsl', role: 'event_admin' }],
      effectiveRole: { role: 'super_admin', scope: 'global', eventIds: [] },
    });
    mockApiGet.mockImplementation((path: string) => Promise.resolve({
      success: true,
      data: { data: path === '/profile/attendee' ? attendee : speaker },
    }));
    mockApiRequest.mockImplementation((path: string) => Promise.resolve({
      success: true,
      data: { data: path === '/profile/attendee' ? attendee : speaker },
    }));
    mockGetSession.mockResolvedValue({
      data: { session: { user: { ...profileUser, user_metadata: {} } } },
    });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockUpsert.mockResolvedValue({ error: null });
  });

  afterEach(async () => {
    if (mountedRenderer) {
      await act(async () => mountedRenderer?.unmount());
    }
    mountedRenderer = null;
  });

  const renderProfile = async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ProfileScreen />);
      await Promise.resolve();
    });
    await flush();
    mountedRenderer = renderer!;
    return renderer!;
  };

  it('shows every assigned role, speaker information, and the speaker photo', async () => {
    const renderer = await renderProfile();

    expect(mockApiGet).toHaveBeenCalledWith('/profile/speaker', { skipEventSegment: true });
    expect(renderer.root.findByProps({ children: 'Super Admin · Event Admin · bsl · Speaker' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'Speaker Information' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'Founder & CEO' })).toBeTruthy();
    expect(renderer.root.findAll((node: any) => node.props?.source?.uri === speaker.imageUrl)).not.toHaveLength(0);
  });

  it('shows editable attendee information for every signed-in user', async () => {
    const renderer = await renderProfile();

    expect(mockApiGet).toHaveBeenCalledWith('/profile/attendee', { skipEventSegment: true });
    expect(renderer.root.findByProps({ children: 'Attendee Information' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: attendee.title })).toBeTruthy();
    expect(renderer.root.findByProps({ children: attendee.company })).toBeTruthy();
  });

  it('saves attendee title and company through the self-scoped profile API', async () => {
    const renderer = await renderProfile();
    await act(async () => {
      pressText(renderer, 'Edit Attendee Information');
      await Promise.resolve();
    });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Attendee role or title' }).props.onChangeText('Chief Product Officer'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Attendee company' }).props.onChangeText('Hashpass'));
    await act(async () => {
      pressText(renderer, 'Save Attendee Information');
      await Promise.resolve();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('/profile/attendee', {
      skipEventSegment: true,
      method: 'PATCH',
      body: { title: 'Chief Product Officer', company: 'Hashpass' },
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Attendee Information Updated',
      'Your role and company will appear on meeting requests.',
    );
  });

  it('keeps the role label in a loading state until access has resolved', async () => {
    let resolveAccess: (value: any) => void = () => undefined;
    mockGetCurrentAdminAccess.mockImplementationOnce(() => new Promise((resolve) => {
      resolveAccess = resolve;
    }));

    const renderer = await renderProfile();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Loading account roles' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ children: 'General User' })).toHaveLength(0);

    await act(async () => {
      resolveAccess({
        globalRole: 'super_admin',
        globalRoles: ['super_admin'],
        eventRoles: [{ eventId: 'bsl', role: 'event_admin' }],
        effectiveRole: { role: 'super_admin', scope: 'global', eventIds: [] },
      });
      await Promise.resolve();
    });
    await flush();

    expect(renderer.root.findByProps({ children: 'Super Admin · Event Admin · bsl · Speaker' })).toBeTruthy();
  });

  it('handles a null auth profile while the first session resolves', async () => {
    mockAuthHookUser = null;
    mockAuthServiceGetUser.mockReturnValue(null);
    mockAuthServiceGetSession.mockResolvedValue({ user: profileUser });

    const renderer = await renderProfile();

    expect(renderer.root.findAllByProps({ children: 'Edward Calderón' })).not.toHaveLength(0);
  });

  it('updates the linked speaker profile through the self-scoped API', async () => {
    const renderer = await renderProfile();
    await act(async () => {
      pressText(renderer, 'Edit Speaker Information');
      await Promise.resolve();
    });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Speaker name' }).props.onChangeText('Edward C.'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Speaker display role' }).props.onChangeText('CEO'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Speaker company' }).props.onChangeText('Hashpass Labs'));
    await act(async () => {
      pressText(renderer, 'Save Speaker Information');
      await Promise.resolve();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('/profile/speaker', {
      skipEventSegment: true,
      method: 'PATCH',
      body: { name: 'Edward C.', title: 'CEO', company: 'Hashpass Labs' },
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Speaker Information Updated',
      'Your attendee-facing speaker profile is up to date.',
    );
  });

  it('keeps the public speaker avatar in sync with a selected profile photo', async () => {
    const renderer = await renderProfile();
    await act(async () => {
      pressText(renderer, 'Change Avatar');
      await Promise.resolve();
    });
    await act(async () => {
      pressText(renderer, 'Simple');
      await Promise.resolve();
    });

    expect(mockUpdateUser).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: profileUser.id }), { onConflict: 'user_id' });
    expect(mockApiRequest).toHaveBeenCalledWith('/profile/speaker', expect.objectContaining({
      method: 'PATCH',
      body: expect.objectContaining({ imageUrl: expect.stringContaining('ui-avatars.com') }),
    }));
  });
});
