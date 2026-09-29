/// <reference types="jest" />

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usePathname } from 'expo-router';
import {
  isMcpRoute,
  RootUserDataProviders,
} from '../../components/RootUserDataProviders';

jest.mock('expo-router', () => ({
  usePathname: jest.fn(),
}));
function mockNotificationProvider({ children }: { children: React.ReactNode }) {
  return React.createElement('NotificationProvider', null, children);
}

function mockBalanceProvider({ children }: { children: React.ReactNode }) {
  return React.createElement('BalanceProvider', null, children);
}

jest.mock('../../contexts/NotificationContext', () => ({
  NotificationProvider: mockNotificationProvider,
}));
jest.mock('../../contexts/BalanceContext', () => ({
  BalanceProvider: mockBalanceProvider,
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('RootUserDataProviders', () => {
  it.each(['/mcp', '/mcp/consent', '/(shared)/mcp/login'])(
    'isolates %s from browser-side user data providers',
    (pathname) => {
      expect(isMcpRoute(pathname)).toBe(true);
      mockUsePathname.mockReturnValue(pathname);

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <RootUserDataProviders>
            <span>OAuth</span>
          </RootUserDataProviders>,
        );
      });

      expect(renderer!.root.findAllByType('NotificationProvider' as never)).toHaveLength(0);
      expect(renderer!.root.findAllByType('BalanceProvider' as never)).toHaveLength(0);
    },
  );

  it('keeps user data providers on regular application routes', () => {
    expect(isMcpRoute('/dashboard')).toBe(false);
    mockUsePathname.mockReturnValue('/dashboard');

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <RootUserDataProviders>
          <span>Dashboard</span>
        </RootUserDataProviders>,
      );
    });

    expect(renderer!.root.findAllByType('NotificationProvider' as never)).toHaveLength(1);
    expect(renderer!.root.findAllByType('BalanceProvider' as never)).toHaveLength(1);
  });
});
