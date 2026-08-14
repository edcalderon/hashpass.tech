/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
  Platform: { OS: 'android' },
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

jest.mock(
  'react-native-css-interop/src/runtime/native/appearance-observables',
  () => ({
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('react-native-css-interop', () => ({
  createInteropElement: require('react').createElement,
}));

jest.mock('@hashpass/utils', () => ({
  memoryManager: {
    registerSubscription: jest.fn(),
    unregisterSubscription: jest.fn(),
  },
}));

const mockEnsureChatKeyPair = jest.fn();
const mockFetchParticipantPublicKey = jest.fn();
const mockEncryptChatMessage = jest.fn();
const mockDecryptChatMessage = jest.fn();

jest.mock('../../lib/chat-encryption', () => ({
  ensureChatKeyPair: (...args: unknown[]) => mockEnsureChatKeyPair(...args),
  fetchParticipantPublicKey: (...args: unknown[]) => mockFetchParticipantPublicKey(...args),
  encryptChatMessage: (...args: unknown[]) => mockEncryptChatMessage(...args),
  decryptChatMessage: (...args: unknown[]) => mockDecryptChatMessage(...args),
}));

const mockRpc = jest.fn();
const mockRemoveChannel = jest.fn();
let latestChannelHandlers: Record<string, (payload: any) => void> = {};
let latestSubscribeCallback: ((status: string) => void) | null = null;

const makeMockChannel = () => {
  const channel: any = {
    on: jest.fn((_type: string, filterOrConfig: any, handler: (payload: any) => void) => {
      const key = filterOrConfig?.event || filterOrConfig?.table || 'unknown';
      latestChannelHandlers[key] = handler;
      return channel;
    }),
    subscribe: jest.fn((cb?: (status: string) => void) => {
      latestSubscribeCallback = cb || null;
      cb?.('SUBSCRIBED');
      return channel;
    }),
    send: jest.fn(),
  };
  return channel;
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => makeMockChannel()),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// @hashpass/utils schedules a real setInterval at module-evaluation time
// (performance-utils.ts's image-cache cleanup, gated only on `typeof window
// !== 'undefined'`, true in this test environment) -- a plain top-level
// `import` would be hoisted before any jest.useFakeTimers() call could run,
// so fake timers must already be installed before this module (transitively
// pulled in by the hook) is required.
jest.useFakeTimers();
interface RealtimeChatProps {
  meetingId: string;
  roomName: string;
  username: string;
  userId: string;
  otherParticipantId?: string;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRealtimeChat } = require('../../hooks/useRealtimeChat') as {
  useRealtimeChat: (props: RealtimeChatProps) => any;
};

let latest: ReturnType<typeof useRealtimeChat> | null = null;

function Capture(props: Parameters<typeof useRealtimeChat>[0]) {
  latest = useRealtimeChat(props);
  return null;
}

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const renderHook = async (props: Parameters<typeof useRealtimeChat>[0]) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Capture, props));
    await flushPromises();
  });
  return renderer;
};

describe('useRealtimeChat', () => {
  const myPriv = new Uint8Array([1, 2, 3]);
  const theirPub = new Uint8Array([4, 5, 6]);

  beforeEach(() => {
    // The presence channel schedules a real setInterval (PRESENCE_INTERVAL)
    // that a plain unmount doesn't outrace in a real Jest process -- fake
    // timers keep it from ever firing for real and dangling past this file's
    // run, the same fix used for my-requests-screen.test.tsx's "Cannot log
    // after tests are done" issue.
    jest.useFakeTimers();
    jest.clearAllMocks();
    latestChannelHandlers = {};
    latestSubscribeCallback = null;
    latest = null;
    mockEnsureChatKeyPair.mockResolvedValue(myPriv);
    mockFetchParticipantPublicKey.mockResolvedValue(theirPub);
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_meeting_chat_messages') {
        return Promise.resolve({ data: { success: true, messages: [] }, error: null });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('sets up keys and loads message history, decrypting each row', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_meeting_chat_messages') {
        return Promise.resolve({
          data: {
            success: true,
            messages: [
              { id: 'm1', sender_id: 'other-user', ciphertext: 'aa', nonce: 'bb', message_type: 'text', created_at: '2026-08-05T10:00:00Z' },
            ],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });
    mockDecryptChatMessage.mockReturnValue('Hey, running late!');

    const renderer = await renderHook({
      meetingId: 'meeting-1',
      roomName: 'room-1',
      username: 'Me',
      userId: 'my-user-id',
      otherParticipantId: 'other-user',
    });

    expect(mockEnsureChatKeyPair).toHaveBeenCalledWith('my-user-id');
    expect(mockFetchParticipantPublicKey).toHaveBeenCalledWith('other-user');
    expect(latest!.loading).toBe(false);
    expect(latest!.otherKeyMissing).toBe(false);
    expect(latest!.messages).toEqual([
      expect.objectContaining({ id: 'm1', content: 'Hey, running late!', decryptionFailed: false }),
    ]);

    await act(async () => renderer.unmount());
  });

  it('flags otherKeyMissing when the other participant has not set up chat yet, and disallows sending until they have', async () => {
    mockFetchParticipantPublicKey.mockResolvedValue(null);

    const renderer = await renderHook({
      meetingId: 'meeting-1',
      roomName: 'room-1',
      username: 'Me',
      userId: 'my-user-id',
      otherParticipantId: 'other-user',
    });

    expect(latest!.otherKeyMissing).toBe(true);

    await act(async () => renderer.unmount());
  });

  it('appends a new row received via postgres_changes, decrypting it and de-duping by id', async () => {
    mockDecryptChatMessage.mockReturnValue('Incoming live message');

    const renderer = await renderHook({
      meetingId: 'meeting-1',
      roomName: 'room-1',
      username: 'Me',
      userId: 'my-user-id',
      otherParticipantId: 'other-user',
    });

    expect(latest!.messages).toHaveLength(0);

    await act(async () => {
      latestChannelHandlers['INSERT']?.({
        new: { id: 'm2', sender_id: 'other-user', ciphertext: 'cc', nonce: 'dd', message_type: 'text', created_at: '2026-08-05T10:05:00Z' },
      });
      await flushPromises();
    });

    expect(latest!.messages).toEqual([
      expect.objectContaining({ id: 'm2', content: 'Incoming live message' }),
    ]);

    // A duplicate insert of the same id (e.g. an echo of our own optimistic
    // send) must not produce a second entry.
    await act(async () => {
      latestChannelHandlers['INSERT']?.({
        new: { id: 'm2', sender_id: 'other-user', ciphertext: 'cc', nonce: 'dd', message_type: 'text', created_at: '2026-08-05T10:05:00Z' },
      });
      await flushPromises();
    });
    expect(latest!.messages).toHaveLength(1);

    await act(async () => renderer.unmount());
  });

  it('refreshes immediately when the peer broadcasts that a persisted message is available', async () => {
    mockDecryptChatMessage.mockReturnValue('Delivered through broadcast refresh');
    let historyRows: any[] = [];
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_meeting_chat_messages') {
        return Promise.resolve({ data: { success: true, messages: historyRows }, error: null });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });

    const renderer = await renderHook({
      meetingId: 'meeting-1',
      roomName: 'room-1',
      username: 'Me',
      userId: 'my-user-id',
      otherParticipantId: 'other-user',
    });

    historyRows = [
      { id: 'broadcast-1', sender_id: 'other-user', ciphertext: 'aa', nonce: 'bb', message_type: 'text', created_at: '2026-08-05T10:15:00Z' },
    ];
    await act(async () => {
      latestChannelHandlers['meeting-chat-message-available']?.({ payload: { meetingId: 'meeting-1', messageId: 'broadcast-1' } });
      await flushPromises();
    });

    expect(latest!.messages).toEqual([
      expect.objectContaining({ id: 'broadcast-1', content: 'Delivered through broadcast refresh' }),
    ]);
    await act(async () => renderer.unmount());
  });

  it('sends a message: encrypts, persists via RPC, then optimistically appends the plaintext', async () => {
    mockEncryptChatMessage.mockReturnValue({ ciphertext: 'ee', nonce: 'ff' });
    mockRpc.mockImplementation((fn: string, args: any) => {
      if (fn === 'get_meeting_chat_messages') {
        return Promise.resolve({ data: { success: true, messages: [] }, error: null });
      }
      if (fn === 'send_meeting_chat_message') {
        expect(args).toEqual({
          p_meeting_id: 'meeting-1',
          p_sender_id: 'my-user-id',
          p_ciphertext: 'ee',
          p_nonce: 'ff',
          p_message_type: 'text',
        });
        return Promise.resolve({ data: { success: true, id: 'm3', created_at: '2026-08-05T10:10:00Z' }, error: null });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });

    const renderer = await renderHook({
      meetingId: 'meeting-1',
      roomName: 'room-1',
      username: 'Me',
      userId: 'my-user-id',
      otherParticipantId: 'other-user',
    });

    await act(async () => {
      await latest!.sendMessage('On my way!');
    });

    expect(mockEncryptChatMessage).toHaveBeenCalledWith('On my way!', myPriv, theirPub);
    expect(latest!.messages).toEqual([
      expect.objectContaining({ id: 'm3', content: 'On my way!', user: { name: 'Me', id: 'my-user-id' } }),
    ]);

    await act(async () => renderer.unmount());
  });

  it('rejects sending when the other participant still has no published key', async () => {
    mockFetchParticipantPublicKey.mockResolvedValue(null);

    const renderer = await renderHook({
      meetingId: 'meeting-1',
      roomName: 'room-1',
      username: 'Me',
      userId: 'my-user-id',
      otherParticipantId: 'other-user',
    });

    await expect(latest!.sendMessage('hello')).rejects.toThrow(/has not set up secure chat/);

    await act(async () => renderer.unmount());
  });
});
