/// <reference types="jest" />
/**
 * XIcon renders the X (Twitter) brand mark as an inline SVG. It exists
 * because Ionicons dropped `logo-twitter` after the X rebrand and renders
 * a missing-glyph fallback (CircleHelp on web, tofu on native) for that
 * name — see the component header comment for the full rationale.
 *
 * Mocks `react-native-svg` as string host types, matching the convention
 * in `tests/components/icons/SettingsIcons.test.tsx`, so we can assert on
 * the exact SVG structure the component emits.
 */

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
}));

import { XIcon } from '../../../components/icons/XIcon';

describe('XIcon', () => {
  it('renders the X brand SVG with default size and color', () => {
    const result = XIcon({});

    expect(result).toMatchObject({
      props: { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none' },
    });
    // The X brand mark is a filled path, not a stroke — matches the
    // official X Corp SVG (fill-based like a logo, not line-icon style).
    const path = result.props.children;
    expect(path.type).toBe('Path');
    expect(path.props.d).toContain('M18.244 2.25h3.308');
    expect(path.props.fill).toBe('currentColor');
  });

  it('forwards explicit size and color props to the SVG root and path', () => {
    const result = XIcon({ size: 32, color: '#ff00aa' });

    expect(result).toMatchObject({
      props: { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none' },
    });
    const path = result.props.children;
    expect(path.props.fill).toBe('#ff00aa');
  });
});
