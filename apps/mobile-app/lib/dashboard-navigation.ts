export const DASHBOARD_LANDING_ROUTE = '/' as const;

type DashboardRouter = {
  replace?: (route: typeof DASHBOARD_LANDING_ROUTE) => void;
  push?: (route: typeof DASHBOARD_LANDING_ROUTE) => void;
};

type DashboardDrawerNavigation = {
  dispatch?: (action: unknown) => void;
};

export const navigateDashboardBrandToLanding = ({
  navigation,
  router,
  closeDrawerAction,
}: {
  navigation?: DashboardDrawerNavigation | null;
  router: DashboardRouter;
  closeDrawerAction: unknown;
}) => {
  navigation?.dispatch?.(closeDrawerAction);

  if (typeof router.replace === 'function') {
    router.replace(DASHBOARD_LANDING_ROUTE);
    return;
  }

  router.push?.(DASHBOARD_LANDING_ROUTE);
};
