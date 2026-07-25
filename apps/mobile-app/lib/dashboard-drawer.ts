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

const findDispatchNavigation = (
  navigation?: DashboardDrawerNavigation | null,
): DashboardDrawerNavigation | null => {
  const seen = new Set<DashboardDrawerNavigation>();
  let current = navigation;

  while (current && !seen.has(current)) {
    if (typeof current.dispatch === 'function') {
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
  // The drawerContent navigation is the strongest reference because React
  // Navigation passes it directly from the Drawer navigator. During the first
  // release render it may not exist yet, so fall back to the header navigation
  // and let React Navigation bubble the generic OPEN_DRAWER action.
  //
  // Do not require getState().type/key here. Optimized native builds can expose
  // only a partial navigation state, and targeting the action at that snapshot
  // made a valid production hamburger tap silently no-op.
  const dispatcher = findDispatchNavigation(drawerNavigation)
    ?? findDispatchNavigation(navigation);

  if (!dispatcher || typeof dispatcher.dispatch !== 'function') {
    return false;
  }

  dispatcher.dispatch(openDrawerAction);
  return true;
};
