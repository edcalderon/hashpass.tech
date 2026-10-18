import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Widest readable column for dashboard pages; wider screens center it. */
export const DASHBOARD_PAGE_MAX_WIDTH = 1040;
/** Gap between the dashboard navbar and the first piece of page content. */
export const DASHBOARD_PAGE_TOP_GAP = 16;
export const DASHBOARD_PAGE_SIDE_PADDING = 20;

/**
 * One layout contract for every dashboard view (wallet, notifications,
 * profile, settings...): same centered column on wide screens and the same
 * distance from the navbar to the first title.
 *
 * The drawer renders its header above the scene (it is not transparent), so
 * page content already starts below the navbar. `topInset` is therefore only
 * the gap -- never add the navbar height here or the gap doubles.
 */
export function useDashboardPageLayout() {
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const column: ViewStyle = {
      width: '100%',
      maxWidth: DASHBOARD_PAGE_MAX_WIDTH,
      alignSelf: 'center',
    };
    return {
      topInset: DASHBOARD_PAGE_TOP_GAP,
      bottomInset: insets.bottom + 40,
      column,
    };
  }, [insets.bottom]);
}
