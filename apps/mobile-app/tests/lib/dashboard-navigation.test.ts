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

    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction,
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(closeDrawerAction);
    expect(router.replace).toHaveBeenCalledWith(DASHBOARD_LANDING_ROUTE);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('falls back to push when replace is unavailable', () => {
    const navigation = { dispatch: jest.fn() };
    const router = { push: jest.fn() };

    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction: { type: 'CLOSE_DRAWER' },
    });

    expect(router.push).toHaveBeenCalledWith(DASHBOARD_LANDING_ROUTE);
  });
});
