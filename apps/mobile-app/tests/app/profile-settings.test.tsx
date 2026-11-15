import React from 'react';
import { act, create } from 'react-test-renderer';
import ProfileSettingsScreen from '../../app/(shared)/dashboard/profile-settings';

jest.mock('../../app/(shared)/dashboard/profile', () => ({ __esModule: true, default: 'ProfileScreen' }));
jest.mock('../../app/(shared)/dashboard/settings', () => ({ __esModule: true, default: 'SettingsScreen' }));

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
