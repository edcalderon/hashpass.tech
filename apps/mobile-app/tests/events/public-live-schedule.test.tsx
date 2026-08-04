/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockRequest = jest.fn();

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ eventSlug: 'chile2026', shareToken: 'token' }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ setOptions: jest.fn() }) }));
jest.mock('react-native-edge-to-edge', () => ({ SystemBars: 'SystemBars' }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: { primary: '#c00', background: { primary: '#fff', paper: '#fff' }, divider: '#ddd', text: { primary: '#111', secondary: '#666' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string, values?: Record<string, string>) => fallback.replace('{user}', values?.user || '').replace('{eventName}', values?.eventName || '').replace('{time}', values?.time || '') }) }));
jest.mock('../../lib/api-client', () => ({ apiClient: { request: (...args: unknown[]) => mockRequest(...args) }, eventApiPath: () => '/api/events/chile2026/schedule' }));
jest.mock('../../lib/event-branding', () => ({ getTourBrandAsset: () => ({ label: 'BSL Chile 2026', accentColor: '#f55', logo: null }) }));
jest.mock('../../config/events', () => ({ EVENTS: { chile2026: { eventStartDate: '2026-08-05T00:00:00Z' } } }));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

describe('public live schedule route', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { owner: '@ada.lovelace', data: [{ id: '1', time: '08:30-09:30', title: 'Opening', type: 'keynote', day_name: 'Day 1', location: 'Main stage', speakers: ['Grace Hopper'] }] } });
  });

  afterEach(() => jest.useRealTimers());

  it('renders the live schedule shell while loading', () => {
    const { default: Screen } = require('../../app/events/[eventSlug]/schedule/live/[shareToken]');
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(Screen));
    });
    expect(renderer!.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);
    renderer!.unmount();
  });

  it('shows an invalid-link state when the public request fails', async () => {
    mockRequest.mockResolvedValue({ success: false, error: 'expired' });
    const { default: Screen } = require('../../app/events/[eventSlug]/schedule/live/[shareToken]');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Screen));
      await Promise.resolve();
    });
    const text = renderer!.root.findAllByType('Text' as any).map((node) => node.props.children).flat().join(' ');
    expect(text).toContain('expired');
  });
});
