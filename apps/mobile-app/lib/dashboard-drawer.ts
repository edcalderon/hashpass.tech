export type DashboardDrawerNavigation = {
  dispatch?: (action: Record<string, unknown>) => void;
  getParent?: () => DashboardDrawerNavigation | undefined;
  getState?: () => { key?: string; type?: string } | undefined;
};

type OpenTargetedDashboardDrawerOptions = {
  navigation?: DashboardDrawerNavigation | null;
  drawerNavigation?: DashboardDrawerNavigation | null;
  openDrawerAction: Record<string, unknown>;
};

const findDrawerNavigation = (
  navigation?: DashboardDrawerNavigation | null,
): DashboardDrawerNavigation | null => {
  const seen = new Set<DashboardDrawerNavigation>();
  let current = navigation;

  while (current && !seen.has(current)) {
    const state = current.getState?.();
    if (
      state?.type === 'drawer'
      && typeof state.key === 'string'
      && typeof current.dispatch === 'function'
    ) {
      return current;
    }

    seen.add(current);
    current = current.getParent?.();
  }

  return null;
};

export const openTargetedDashboardDrawer = ({
  navigation,
  drawerNavigation,
  openDrawerAction,
}: OpenTargetedDashboardDrawerOptions): boolean => {
  const drawer = findDrawerNavigation(navigation)
    ?? findDrawerNavigation(drawerNavigation);
  const drawerState = drawer?.getState?.();

  if (
    !drawer
    || typeof drawer.dispatch !== 'function'
    || typeof drawerState?.key !== 'string'
  ) {
    return false;
  }

  drawer.dispatch({
    ...openDrawerAction,
    target: drawerState.key,
  });
  return true;
};
