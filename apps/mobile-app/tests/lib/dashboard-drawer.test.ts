/// <reference types="jest" />

import { openTargetedDashboardDrawer } from '../../lib/dashboard-drawer';

describe('openTargetedDashboardDrawer', () => {
  it('dispatches OPEN_DRAWER to the Drawer parent instead of a header Stack helper', () => {
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
      target: 'dashboard-drawer',
    });
    expect(headerStack.openDrawer).not.toHaveBeenCalled();
  });

  it('uses the drawer-content navigation fallback when the header has no Drawer parent', () => {
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
      target: 'dashboard-drawer',
    });
  });
});
