import { renderHook } from '@testing-library/react-native';
import {
  DASHBOARD_PAGE_MAX_WIDTH,
  DASHBOARD_PAGE_TOP_GAP,
  useDashboardPageLayout,
} from '../../hooks/useDashboardPageLayout';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 12, left: 0, right: 0 }),
}));

describe('useDashboardPageLayout', () => {
  it('uses only the navbar gap on top, since the header is not an overlay', () => {
    const { result } = renderHook(() => useDashboardPageLayout());
    expect(result.current.topInset).toBe(DASHBOARD_PAGE_TOP_GAP);
  });

  it('adds the safe-area bottom inset and centers a max-width column', () => {
    const { result } = renderHook(() => useDashboardPageLayout());
    expect(result.current.bottomInset).toBe(52);
    expect(result.current.column).toEqual({
      width: '100%',
      maxWidth: DASHBOARD_PAGE_MAX_WIDTH,
      alignSelf: 'center',
    });
  });
});
