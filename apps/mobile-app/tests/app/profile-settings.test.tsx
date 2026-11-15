import React from 'react';
import { act, create } from 'react-test-renderer';
import { i18n } from '@lingui/core';
import ProfileSettingsScreen from '../../app/(shared)/dashboard/profile-settings';

jest.mock('@hashpass/ui/primitives', () => ({ SegmentedTabs: 'SegmentedTabs' }));
jest.mock('@lingui/macro', () => ({ t: ({ message }: { message: string }) => message }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false, colors: { primary: '#00A9E0', background: { paper: '#fff' } } }),
}));
jest.mock('../../hooks/useDashboardPageLayout', () => ({ useDashboardPageLayout: () => ({ topInset: 16 }) }));
jest.mock('../../app/(shared)/dashboard/profile', () => ({ __esModule: true, default: 'ProfileScreen' }));
jest.mock('../../app/(shared)/dashboard/settings', () => ({ __esModule: true, default: 'SettingsScreen' }));

it('keeps Profile and Settings in one tabbed view and hides inactive content from assistive technology', async () => {
  i18n.load('en', {});
  i18n.activate('en');
  let view!: ReturnType<typeof create>;
  await act(async () => { view = create(<ProfileSettingsScreen />); });

  const tabs = view.root.findByType('SegmentedTabs' as never);
  expect(tabs.props.value).toBe('profile');
  expect(tabs.props.tabs.map((tab: { id: string }) => tab.id)).toEqual(['profile', 'settings']);
  expect(view.root.findByType('ProfileScreen' as never).props.embedded).toBe(true);
  expect(view.root.findByType('SettingsScreen' as never).props.embedded).toBe(true);
  expect(view.root.findByType('SettingsScreen' as never).parent?.props.importantForAccessibility).toBe('no-hide-descendants');

  await act(async () => { tabs.props.onChange('settings'); });

  expect(view.root.findByType('SegmentedTabs' as never).props.value).toBe('settings');
  expect(view.root.findByType('ProfileScreen' as never).parent?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(view.root.findByType('SettingsScreen' as never).parent?.props.importantForAccessibility).toBe('auto');
  act(() => view.unmount());
});
