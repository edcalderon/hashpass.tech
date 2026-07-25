/// <reference types="jest" />

import { openTargetedDashboardDrawer } from '../../lib/dashboard-drawer';

describe('openTargetedDashboardDrawer', () => {
  it('dispatches OPEN_DRAWER through the live drawer-content navigation', () => {
    const drawer = {
      getState: jest.fn(() => ({ key: 'dashboard-drawer', type: 'drawer' })),
      dispatch: jest.fn(),
    };
    const headerStack = {
      getState: jest.fn(() => ({ key: 'dashboard-stack', type: 'stack' })),
      getParent: jest.fn(() => drawer),
      openDrawer: jest.fn(),
    };

    expect(openTargetedDashboardDrawer).toBeDefined();

    expect(openTargetedDashboardDrawer({
      navigation: headerStack,
      drawerNavigation: null,
      openDrawerAction: { type: 'OPEN_DRAWER' },
    })).toBe(true);
    expect(drawer.dispatch).toHaveBeenCalledWith({
      type: 'OPEN_DRAWER',
    });
    expect(headerStack.openDrawer).not.toHaveBeenCalled();
  });

  it('prefers the drawer-content navigation over a header navigator', () => {
    const drawer = {
      getState: jest.fn(() => ({ key: 'dashboard-drawer', type: 'drawer' })),
      dispatch: jest.fn(),
    };
    const headerStack = {
      getState: jest.fn(() => ({ key: 'dashboard-stack', type: 'stack' })),
      getParent: jest.fn(() => undefined),
    };

    expect(openTargetedDashboardDrawer).toBeDefined();

    expect(openTargetedDashboardDrawer({
      navigation: headerStack,
      drawerNavigation: drawer,
      openDrawerAction: { type: 'OPEN_DRAWER' },
    })).toBe(true);
    expect(drawer.dispatch).toHaveBeenCalledWith({
      type: 'OPEN_DRAWER',
    });
    expect(headerStack.getParent).not.toHaveBeenCalled();
  });

  it('does not reject a production navigation object with partial state', () => {
    const releaseNavigation = {
      getState: jest.fn(() => ({ key: 'dashboard-drawer' })),
      dispatch: jest.fn(),
    };

    expect(openTargetedDashboardDrawer({
      navigation: releaseNavigation,
      drawerNavigation: null,
      openDrawerAction: { type: 'OPEN_DRAWER' },
    })).toBe(true);
    expect(releaseNavigation.dispatch).toHaveBeenCalledWith({
      type: 'OPEN_DRAWER',
    });
  });

  it('returns false only when neither navigation object can dispatch', () => {
    expect(openTargetedDashboardDrawer({
      navigation: { getState: jest.fn(() => undefined) },
      drawerNavigation: null,
      openDrawerAction: { type: 'OPEN_DRAWER' },
    })).toBe(false);
  });
});
