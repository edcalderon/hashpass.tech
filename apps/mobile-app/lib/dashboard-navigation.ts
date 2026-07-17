// Target `/home` directly, not `/`. The `/` index route forwards an
// authenticated visitor to the dashboard (see app/index.tsx), so routing this
// deliberate "back to landing" action through `/` would immediately bounce a
// logged-in user right back into the dashboard. `/home` renders the landing
// (with its "Welcome back" state) regardless of auth.
export const DASHBOARD_LANDING_ROUTE = '/home' as const;

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
