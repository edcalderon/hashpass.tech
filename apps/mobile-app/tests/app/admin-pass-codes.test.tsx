/// <reference types="jest" />

import React from 'react';
import { Alert, ScrollView } from 'react-native';

import AdminPanel from '../../app/(shared)/dashboard/admin';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const mockAdminUser = { id: 'admin-user' };
let mountedRenderer: ReturnType<typeof create> | null = null;

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563eb',
      background: { default: '#f8fafc', paper: '#ffffff' },
      divider: '#d1d5db',
      text: { primary: '#111827', secondary: '#4b5563', disabled: '#9ca3af' },
    },
  }),
}));
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAdminUser, isLoading: false }),
}));
jest.mock('../../lib/admin-access', () => ({
  getCurrentAdminAccess: jest.fn(async () => ({ globalRole: 'super_admin', eventRoles: [] })),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockSupabaseFrom(...args) },
}));
jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
}));
jest.mock('../../lib/event-path', () => ({ resolveActiveEventId: () => 'chile2026' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('../../components/AdminQRScanner', () => 'AdminQRScanner');
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

const { act, create } = require('react-test-renderer');

const triggerPress = (node: any) => {
  const handler = node.props.onPress ?? node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Expected a pressable node');
  handler();
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('AdminPanel pass codes', () => {
  afterEach(() => {
    mountedRenderer?.unmount();
    mountedRenderer = null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(async () => ({ data: [], error: null })),
    };
    mockSupabaseFrom.mockReturnValue(query);
    mockGet.mockResolvedValue({
      success: true,
      data: {
        data: [{
          id: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4',
          event_id: 'chile2026',
          label: 'Chile public promotion',
          pass_type: 'general',
          max_claims: null,
          claimed_count: 4,
          expires_at: null,
          is_active: true,
          created_at: '2026-08-01T00:00:00.000Z',
        }],
      },
    });
    mockPost.mockResolvedValue({ success: true, data: { code: 'BSL2026VIP' } });
  });

  const renderPanel = async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<AdminPanel />);
      await Promise.resolve();
    });
    await flush();
    mountedRenderer = renderer!;
    return renderer!;
  };

  const openPassCodes = async (renderer: ReturnType<typeof create>) => {
    const tabLabel = renderer.root.findByProps({ children: 'Pass Codes' });
    await act(async () => {
      triggerPress(tabLabel.parent);
      await Promise.resolve();
    });
    await flush();
  };

  it('keeps admin actions in a single horizontally scrollable tab row', async () => {
    const renderer = await renderPanel();

    const tabScroller = renderer.root
      .findAllByType(ScrollView)
      .find((node: any) => node.props.horizontal === true);

    expect(tabScroller).toBeTruthy();
    expect(tabScroller?.props.showsHorizontalScrollIndicator).toBe(false);
    expect(tabScroller?.props.contentContainerStyle).toBeDefined();

    act(() => {
      tabScroller?.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
      tabScroller?.props.onContentSizeChange(960, 42);
    });
    const moreButton = renderer.root.findByProps({ accessibilityLabel: 'Show more admin sections' });
    expect(moreButton).toBeTruthy();

    act(() => {
      triggerPress(moreButton);
    });
    const backButton = renderer.root.findByProps({ accessibilityLabel: 'Scroll admin sections back to the beginning' });
    expect(backButton).toBeTruthy();

    act(() => {
      triggerPress(backButton);
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Show more admin sections' })).toBeTruthy();
  });

  it('lists campaign metadata without a raw code value', async () => {
    const renderer = await renderPanel();
    await openPassCodes(renderer);

    expect(mockGet).toHaveBeenCalledWith('/admin/pass-codes?eventId=chile2026', { skipEventSegment: true });
    expect(renderer.root.findByProps({ children: 'Chile public promotion' })).toBeTruthy();
  });

  it('creates an unlimited campaign and displays the generated raw code once', async () => {
    const renderer = await renderPanel();
    await openPassCodes(renderer);

    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Create Pass Code' }).parent);
      await Promise.resolve();
    });
    const labelInput = renderer.root.findByProps({ placeholder: 'e.g. Sponsor VIP giveaway' });
    act(() => labelInput.props.onChangeText('VIP partner invitation'));
    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Create code' }).parent);
      await Promise.resolve();
    });

    expect(mockPost).toHaveBeenCalledWith('/admin/pass-codes', expect.objectContaining({
      action: 'create',
      eventId: 'chile2026',
      label: 'VIP partner invitation',
      passType: 'general',
      maxClaims: null,
    }), { skipEventSegment: true });
    expect(mockAlert).toHaveBeenCalledWith(
      'Pass code created',
      expect.stringContaining('BSL2026VIP'),
    );
  });

  it('deactivates a listed campaign through the event-scoped API', async () => {
    const renderer = await renderPanel();
    await openPassCodes(renderer);

    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Deactivate' }).parent);
      await Promise.resolve();
    });

    expect(mockPost).toHaveBeenCalledWith('/admin/pass-codes', {
      action: 'deactivate',
      eventId: 'chile2026',
      codeId: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4',
    }, { skipEventSegment: true });
  });

  it('lets an event manager assign, activate, and review speaker account access', async () => {
    const managedSpeakers = [
      {
        id: 'edward-calderon',
        name: 'Edward Calderón',
        title: 'Founder & CEO',
        company: 'Hashpass',
        imageUrl: null,
        userId: null,
        isActive: false,
        isAcceptingMeetings: true,
        claim: null,
      },
      {
        id: 'rodrigo-sainz',
        name: 'Rodrigo Sainz',
        title: 'CEO',
        company: 'BSL',
        imageUrl: null,
        userId: 'speaker-user',
        isActive: false,
        isAcceptingMeetings: true,
        claim: {
          email_normalized: 'r@blockchainsummit.la',
          status: 'claimed',
          claim_error: null,
        },
      },
      {
        id: 'active-speaker',
        name: 'Active Speaker',
        title: 'Director',
        company: 'Hashpass',
        imageUrl: null,
        userId: 'active-speaker-user',
        isActive: true,
        isAcceptingMeetings: true,
        claim: {
          email_normalized: 'active@example.com',
          status: 'claimed',
          claim_error: null,
        },
      },
    ];
    mockGet.mockImplementation((path: string) => {
      if (path.startsWith('/admin/speaker-roles')) {
        return Promise.resolve({ success: true, data: { data: managedSpeakers } });
      }
      return Promise.resolve({ success: true, data: { data: [] } });
    });
    const renderer = await renderPanel();

    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Speakers' }).parent);
      await Promise.resolve();
    });
    await flush();

    expect(mockGet).toHaveBeenCalledWith('/admin/speaker-roles?eventId=chile2026', { skipEventSegment: true });
    expect(renderer.root.findByProps({ children: 'UNASSIGNED' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'INACTIVE' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'ACTIVE' })).toBeTruthy();

    const speakerNameOrder = renderer.root
      .findAll((node: any) => ['Active Speaker', 'Edward Calderón', 'Rodrigo Sainz'].includes(node.props.children))
      .map((node: any) => node.props.children);
    expect(speakerNameOrder).toEqual(['Active Speaker', 'Rodrigo Sainz', 'Edward Calderón']);

    const speakerSearch = renderer.root.findByProps({ placeholder: 'Search speakers, organization, or account...' });
    act(() => speakerSearch.props.onChangeText('rodrigo'));
    await flush();
    expect(renderer.root.findByProps({ children: 'Rodrigo Sainz' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ children: 'Edward Calderón' })).toHaveLength(0);
    act(() => speakerSearch.props.onChangeText(''));
    await flush();

    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Assign account' }).parent);
      await Promise.resolve();
    });
    const emailInput = renderer.root.findByProps({ placeholder: 'speaker@example.com' });
    act(() => emailInput.props.onChangeText('edward@hashpass.app'));
    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Assign' }).parent);
      await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledWith('/admin/speaker-roles', expect.objectContaining({
      action: 'grant',
      eventId: 'chile2026',
      speakerId: 'edward-calderon',
      targetEmail: 'edward@hashpass.app',
    }), { skipEventSegment: true });

    await act(async () => {
      triggerPress(renderer.root.findByProps({ children: 'Activate' }).parent);
      await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledWith('/admin/speaker-roles', expect.objectContaining({
      action: 'activate',
      speakerId: 'rodrigo-sainz',
    }), { skipEventSegment: true });

    await act(async () => {
      triggerPress(renderer.root.findAllByProps({ children: 'Remove access' })[1].parent);
      await Promise.resolve();
    });
    expect(mockAlert).toHaveBeenCalledWith(
      'Remove speaker access?',
      expect.stringContaining('Rodrigo Sainz'),
      expect.any(Array),
    );
  });
});
