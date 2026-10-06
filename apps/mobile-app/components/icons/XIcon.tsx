/**
 * Official X (formerly Twitter) brand mark, as an inline SVG path.
 *
 * Ionicons dropped `logo-twitter` after the X rebrand without adding a
 * replacement glyph, so requesting that name renders a missing-icon
 * fallback instead of a logo — a `CircleHelp` question mark on web (see
 * `WebIonicons` in `lib/vector-icons.tsx`) and an empty/tofu glyph on
 * native. Rendering the real path directly with react-native-svg, the
 * same approach used in `SettingsIcons.tsx`, avoids depending on any icon
 * font having this mark at all.
 *
 * Path is the X Corp brand SVG (24x24 viewBox), fill-based like a logo
 * rather than stroke-based like the line icons in SettingsIcons.tsx.
 */

import React from 'react';
import Svg, { Path } from 'react-native-svg';

type XIconProps = { size?: number; color?: string };

export function XIcon({ size = 24, color = 'currentColor' }: XIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill={color}
      />
    </Svg>
  );
}
