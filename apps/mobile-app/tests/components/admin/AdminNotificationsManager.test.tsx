/// <reference types="jest" />

import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import AdminNotificationsManager from '../../../components/admin/AdminNotificationsManager';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock('@hashpass/ui/primitives', () => {
  const ReactModule = jest.requireActual('react');
  const { Pressable, Text, TextInput, View } = jest.requireActual('react-native');
  const Button = ({ label, disabled, loading, onPress }: any) => (
    ReactModule.createElement(Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: label,
      disabled: disabled || loading,
      onPress,
    }, ReactModule.createElement(Text, null, label))
  );
  return {
    ActionButton: Button,
    Badge: ({ children }: any) => ReactModule.createElement(Text, null, children),
    FilterChip: Button,
    FormField: ({ label, accessibilityLabel, ...props }: any) => ReactModule.createElement(TextInput, {
      accessibilityLabel: accessibilityLabel || label,
      ...props,
    }),
    SegmentedTabs: ({ tabs, value, onChange }: any) => ReactModule.createElement(View, null,
      ...tabs.map((tab: any) => ReactModule.createElement(Pressable, {
        key: tab.id,
        accessibilityRole: 'tab',
        accessibilityLabel: tab.label,
        accessibilityState: { selected: tab.id === value },
        onPress: () => onChange(tab.id),
      }, ReactModule.createElement(Text, null, tab.label))),
    ),
    Surface: ({ children }: any) => ReactModule.createElement(View, null, children),
  };
});

function renderManager() {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<AdminNotificationsManager mode="light" initialEventId="bsl" />);
  });
  return renderer;
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
}

function field(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function');
}

function localDateTime(offsetMs: number) {
  const date = new Date(Date.now() + offsetMs);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    input: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
    iso: date.toISOString(),
  };
}

function fillContent(renderer: ReactTestRenderer) {
  act(() => {
    field(renderer, 'Notification title').props.onChangeText('Event update');
    field(renderer, 'Message').props.onChangeText('Doors open at 09:00.');
  });
}

describe('AdminNotificationsManager', () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue({ success: true, data: { data: [] } });
    mockPost.mockReset();
  });

  it('labels the global audience and validates malformed local schedule times', () => {
    const renderer = renderManager();
    expect(renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat()).toContain('All registered users');
    expect(renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' '))
      .toContain('email subscriptions are not checked');
    expect(field(renderer, 'Schedule send (optional)')).toBeTruthy();
    expect(field(renderer, 'Expires at (optional)')).toBeTruthy();

    fillContent(renderer);
    act(() => field(renderer, 'Schedule send (optional)').props.onChangeText('2026-02-31T12:00'));
    expect(renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat())
      .toContain('Enter a valid send time as YYYY-MM-DDTHH:mm.');
    expect(button(renderer, 'Preview audience').props.disabled).toBe(true);

    const scheduled = localDateTime(2 * 60 * 60_000);
    const earlyExpiry = localDateTime(60 * 60_000);
    act(() => {
      field(renderer, 'Schedule send (optional)').props.onChangeText(scheduled.input);
      field(renderer, 'Expires at (optional)').props.onChangeText(earlyExpiry.input);
    });
    expect(renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat())
      .toContain('Expiry must be later than the send time.');
    expect(button(renderer, 'Preview audience').props.disabled).toBe(true);
    act(() => renderer.unmount());
  });

  it('previews and confirms a scheduled notification with an expiry in local time', async () => {
    const scheduled = localDateTime(60 * 60_000);
    const expires = localDateTime(4 * 60 * 60_000);
    const previewId = 'preview-123';
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    mockPost
      .mockResolvedValueOnce({ success: true, data: { data: {
        previewId,
        expiresAt,
        scheduledAt: scheduled.iso,
        notificationExpiresAt: expires.iso,
        recipientCount: 42,
        pushRequested: false,
        pushTokenCount: 0,
        sample: [{ email: 'one@example.com', name: 'One User' }],
      } } })
      .mockResolvedValueOnce({ success: true, data: { data: {
        recipients: 42,
        scheduled: true,
        scheduledAt: scheduled.iso,
        pushRequested: false,
      } } });

    const renderer = renderManager();
    fillContent(renderer);
    act(() => {
      field(renderer, 'Schedule send (optional)').props.onChangeText(scheduled.input);
      field(renderer, 'Expires at (optional)').props.onChangeText(expires.input);
    });
    await act(async () => { await button(renderer, 'Preview audience').props.onPress(); });

    expect(mockPost).toHaveBeenNthCalledWith(1, 'admin/notifications', expect.objectContaining({
      action: 'preview',
      audience: 'all_active',
      scheduledAt: scheduled.iso,
      expiresAt: expires.iso,
    }), expect.any(Object));
    let text = renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' ');
    expect(text).toContain('Scheduled for');
    expect(text).toContain('Expires');
    expect(button(renderer, 'Schedule notification')).toBeTruthy();

    act(() => button(renderer, 'Schedule notification').props.onPress());
    expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0);
    const confirmButton = renderer.root.findAll((node) =>
      node.props.accessibilityLabel === 'Schedule notification' && typeof node.props.onPress === 'function',
    )[0];
    await act(async () => { await confirmButton.props.onPress(); });
    expect(mockPost).toHaveBeenNthCalledWith(2, 'admin/notifications', { action: 'send', previewId }, expect.any(Object));
    text = renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' ');
    expect(text).toContain('Notification scheduled for');
    act(() => renderer.unmount());
  });

  it('shows scheduled and expiry details in delivery history, including non-expiring campaigns', async () => {
    mockGet.mockResolvedValueOnce({ success: true, data: { data: [
      {
        id: 'scheduled', title: 'Scheduled update', message: 'Later', level: 'info', deep_link: null,
        push_requested: false, is_test: false, audience: {}, status: 'sending', scheduled_at: '2026-11-03T16:00:00.000Z',
        expires_at: '2026-11-04T16:00:00.000Z', recipient_count: 42, in_app_sent_count: 0,
        push_sent_count: 0, push_failed_count: 0, push_skipped_count: 0, push_error: null,
        created_at: '2026-11-02T16:00:00.000Z', completed_at: null,
      },
      {
        id: 'immediate', title: 'Permanent update', message: 'Always available', level: 'info', deep_link: null,
        push_requested: false, is_test: false, audience: {}, status: 'sent', scheduled_at: null,
        expires_at: null, recipient_count: 2, in_app_sent_count: 2,
        push_sent_count: 0, push_failed_count: 0, push_skipped_count: 0, push_error: null,
        created_at: '2026-11-02T15:00:00.000Z', completed_at: '2026-11-02T15:00:01.000Z',
      },
    ] } });
    const renderer = renderManager();
    await act(async () => { button(renderer, 'Delivery history').props.onPress(); });
    const text = renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' ');
    expect(text).toContain('Scheduled for');
    expect(text).toContain('Expires');
    expect(text).toContain('push delivery queued or in progress');
    expect(text).toContain('Does not expire');
    act(() => renderer.unmount());
  });

  it('sends a selected-account test without including the scheduled time', async () => {
    const scheduled = localDateTime(60 * 60_000);
    const recipient = { id: '22222222-2222-4222-8222-222222222222', email: 'one@example.com', name: 'One User' };
    mockPost
      .mockResolvedValueOnce({ success: true, data: { data: [recipient] } })
      .mockResolvedValueOnce({ success: true, data: { data: { recipients: 1, pushRequested: false } } });
    const renderer = renderManager();
    fillContent(renderer);
    act(() => {
      field(renderer, 'Schedule send (optional)').props.onChangeText(scheduled.input);
      field(renderer, 'Find accounts by email').props.onChangeText('one@example.com');
    });
    await act(async () => { await button(renderer, 'Search users').props.onPress(); });
    await act(async () => { button(renderer, 'Select one@example.com').props.onPress(); });
    await act(async () => { await button(renderer, 'Send test to selected (1/5)').props.onPress(); });

    expect(mockPost).toHaveBeenNthCalledWith(1, 'admin/notifications', { action: 'search', query: 'one@example.com' }, expect.any(Object));
    expect(mockPost).toHaveBeenNthCalledWith(2, 'admin/notifications', expect.objectContaining({
      action: 'test',
      selectedUserIds: [recipient.id],
      scheduledAt: null,
      expiresAt: null,
    }), expect.any(Object));
    const text = renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' ');
    expect(text).toContain('Test delivered in-app to 1 selected account(s). Push was not requested.');
    act(() => renderer.unmount());
  });

  it('confirms an immediate audience send and reports queued push devices', async () => {
    const previewId = 'preview-immediate';
    mockPost
      .mockResolvedValueOnce({ success: true, data: { data: {
        previewId,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        scheduledAt: null,
        notificationExpiresAt: null,
        recipientCount: 42,
        pushRequested: true,
        pushTokenCount: 3,
        sample: [],
      } } })
      .mockResolvedValueOnce({ success: true, data: { data: {
        recipients: 42,
        scheduled: false,
        pushRequested: true,
        pushQueued: 3,
        pushSkipped: 1,
      } } });
    const renderer = renderManager();
    fillContent(renderer);
    act(() => button(renderer, 'In-app only').props.onPress());
    await act(async () => { await button(renderer, 'Preview audience').props.onPress(); });

    expect(mockPost).toHaveBeenNthCalledWith(1, 'admin/notifications', expect.objectContaining({
      action: 'preview',
      scheduledAt: null,
      expiresAt: null,
      pushRequested: true,
    }), expect.any(Object));
    const text = renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' ');
    expect(text).toContain('This notification will not expire.');
    act(() => button(renderer, 'Send to audience').props.onPress());
    await act(async () => { await button(renderer, 'Send now').props.onPress(); });

    expect(mockPost).toHaveBeenNthCalledWith(2, 'admin/notifications', { action: 'send', previewId }, expect.any(Object));
    const updatedText = renderer.root.findAllByType('Text' as never).map((node) => node.props.children).flat().join(' ');
    expect(updatedText).toContain('Notification delivered in-app to 42 account(s). Push queued for 3 device(s); 1 account(s) had no registered device.');
    act(() => renderer.unmount());
  });
});
