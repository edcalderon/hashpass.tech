import React from 'react';
import { act, create } from 'react-test-renderer';
import ProfileSettingsScreen from '../../app/(shared)/dashboard/profile-settings';

let mockRouteShortcut: string | undefined;
const mockSetParams = jest.fn();
jest.mock('../../app/(shared)/dashboard/profile', () => ({ __esModule: true, default: 'ProfileScreen' }));
jest.mock('../../app/(shared)/dashboard/settings', () => ({ __esModule: true, default: 'SettingsScreen' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ shortcut: mockRouteShortcut }),
  useRouter: () => ({ setParams: (...args: unknown[]) => mockSetParams(...args) }),
}));

it('opens Settings from Profile and returns to Profile with one back action', async () => {
  let view!: ReturnType<typeof create>;
  await act(async () => { view = create(<ProfileSettingsScreen />); });

  const profile = view.root.findByType('ProfileScreen' as never);
  expect(profile.props.embedded).toBe(true);
  expect(profile.props.onOpenSettings).toEqual(expect.any(Function));
  expect(view.root.findAllByType('SettingsScreen' as never)).toHaveLength(0);

  await act(async () => { profile.props.onOpenSettings(); });

  const settings = view.root.findByType('SettingsScreen' as never);
  expect(settings.props.embedded).toBe(true);
  expect(settings.props.onBack).toEqual(expect.any(Function));
  expect(view.root.findAllByType('ProfileScreen' as never)).toHaveLength(0);
  await act(async () => { view.root.findByType('SettingsScreen' as never).props.onBack(); });
  expect(view.root.findByType('ProfileScreen' as never).props.onOpenSettings).toEqual(expect.any(Function));
  act(() => view.unmount());
});

it('routes quick setting shortcuts to their matching Settings destinations', async () => {
  let view!: ReturnType<typeof create>;
  await act(async () => { view = create(<ProfileSettingsScreen />); });

  for (const shortcut of ['authenticator', 'delete-account', 'about'] as const) {
    const profile = view.root.findByType('ProfileScreen' as never);
    await act(async () => { profile.props.onOpenSettings(shortcut); });

    const settings = view.root.findByType('SettingsScreen' as never);
    expect(settings.props.initialSettingsShortcut).toBe(shortcut);
    await act(async () => { settings.props.onBack(); });
  }

  act(() => view.unmount());
});

it('opens the authenticator wizard directly from a wallet reminder link', async () => {
  mockRouteShortcut = 'authenticator';
  let view!: ReturnType<typeof create>;
  await act(async () => { view = create(<ProfileSettingsScreen />); });

  expect(view.root.findByType('SettingsScreen' as never).props.initialSettingsShortcut).toBe('authenticator');
  await act(async () => { view.root.findByType('SettingsScreen' as never).props.onBack(); });
  expect(mockSetParams).toHaveBeenCalledWith({ shortcut: undefined });
  expect(view.root.findByType('ProfileScreen' as never)).toBeTruthy();

  mockRouteShortcut = undefined;
  act(() => view.unmount());
});
