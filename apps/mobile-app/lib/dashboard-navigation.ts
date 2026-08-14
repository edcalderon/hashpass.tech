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
  closeDrawer,
  defer = (fn: () => void) => setTimeout(fn, 0),
}: {
  navigation?: DashboardDrawerNavigation | null;
  router: DashboardRouter;
  closeDrawerAction: unknown;
  // Prefer the app's resilient imperative close path (DrawerOpenControlRef /
  // setDrawerOpen in dashboard/_layout.tsx) over a raw navigation.dispatch()
  // of closeDrawerAction -- see the DrawerOpenControlRef comment there for
  // why a raw dispatch is the less reliable path. closeDrawerAction is kept
  // as the fallback for callers that don't have that ref wired up.
  closeDrawer?: () => void;
  // Exposed for tests. Real callers get a real macrotask deferral.
  defer?: (fn: () => void) => void;
}) => {
  if (closeDrawer) {
    closeDrawer();
  } else {
    navigation?.dispatch?.(closeDrawerAction);
  }

  // router.replace() tears down the whole Drawer navigator's screen tree to
  // mount the landing screen. Doing that in the same tick as the close-drawer
  // action above races the drawer's own in-flight native view-tree mutation
  // (the close spring hasn't committed yet) against expo-router's route
  // replace, and crashes Fabric with "addViewAt: failed to insert view ...
  // The specified child already has a parent" -- the same class of bug as
  // the documented rapid burger/X toggle crash (see
  // native-auth-dashboard-crash-handoff.md and
  // project_swipe_close_pr99_and_rapid_toggle_crash memory). Deferring one
  // macrotask lets the close transition start and the dispatch settle before
  // the screen tree is torn down.
  defer(() => {
    if (typeof router.replace === 'function') {
      router.replace(DASHBOARD_LANDING_ROUTE);
      return;
    }

    router.push?.(DASHBOARD_LANDING_ROUTE);
  });
};
