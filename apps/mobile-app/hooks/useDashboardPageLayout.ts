import { useMemo } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScroll } from '@contexts/ScrollContext';

/** Widest readable column for dashboard pages; wider screens center it. */
export const DASHBOARD_PAGE_MAX_WIDTH = 1040;
/** Gap between the dashboard navbar and the first piece of page content. */
export const DASHBOARD_PAGE_TOP_GAP = 16;
export const DASHBOARD_PAGE_SIDE_PADDING = 20;
const FALLBACK_HEADER_HEIGHT = 64;

/**
 * One layout contract for every dashboard view (wallet, notifications,
 * profile, settings...): same centered column on wide screens and the same
 * distance from the navbar to the first title.
 *
 * `topInset` is measured from the real navbar height. Android renders a fixed
 * 64px header below the status bar inset, so it keeps the inset added.
 */
export function useDashboardPageLayout() {
  const { headerHeight } = useScroll();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const fallback = insets.top + FALLBACK_HEADER_HEIGHT;
    const navbar = Platform.OS === 'android'
      ? Math.max(headerHeight, fallback)
      : headerHeight || fallback;
    const topInset = navbar + DASHBOARD_PAGE_TOP_GAP;
    const bottomInset = insets.bottom + 40;
    const column: ViewStyle = {
      width: '100%',
      maxWidth: DASHBOARD_PAGE_MAX_WIDTH,
      alignSelf: 'center',
    };
    return { navbarInset: navbar, topInset, bottomInset, column };
  }, [headerHeight, insets.top, insets.bottom]);
}
