/// <reference types="jest" />

import {
  DASHBOARD_LANDING_ROUTE,
  navigateDashboardBrandToLanding,
} from '../../lib/dashboard-navigation';

describe('navigateDashboardBrandToLanding', () => {
  it('closes the dashboard drawer and replaces the route with landing', () => {
    const closeDrawerAction = { type: 'CLOSE_DRAWER' };
    const navigation = { dispatch: jest.fn() };
    const router = { replace: jest.fn(), push: jest.fn() };
    const defer = (fn: () => void) => fn();

    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction,
      defer,
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(closeDrawerAction);
    expect(router.replace).toHaveBeenCalledWith(DASHBOARD_LANDING_ROUTE);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('falls back to push when replace is unavailable', () => {
    const navigation = { dispatch: jest.fn() };
    const router = { push: jest.fn() };
    const defer = (fn: () => void) => fn();

    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction: { type: 'CLOSE_DRAWER' },
      defer,
    });

    expect(router.push).toHaveBeenCalledWith(DASHBOARD_LANDING_ROUTE);
  });

  it('prefers the resilient closeDrawer callback over a raw dispatch', () => {
    const navigation = { dispatch: jest.fn() };
    const router = { replace: jest.fn() };
    const closeDrawer = jest.fn();
    const defer = (fn: () => void) => fn();

    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction: { type: 'CLOSE_DRAWER' },
      closeDrawer,
      defer,
    });

    expect(closeDrawer).toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(DASHBOARD_LANDING_ROUTE);
  });

  it('defers the route replace by a macrotask so it never lands in the same tick as the close dispatch', () => {
    jest.useFakeTimers();
    try {
      const navigation = { dispatch: jest.fn() };
      const router = { replace: jest.fn() };

      navigateDashboardBrandToLanding({
        navigation,
        router,
        closeDrawerAction: { type: 'CLOSE_DRAWER' },
      });

      expect(navigation.dispatch).toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();

      jest.runAllTimers();

      expect(router.replace).toHaveBeenCalledWith(DASHBOARD_LANDING_ROUTE);
    } finally {
      jest.useRealTimers();
    }
  });
});
