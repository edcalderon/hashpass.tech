import type { ImageSourcePropType } from 'react-native';
import type { ReactNode } from 'react';

export interface AgendaRowLeadProps {
  /** Photo shown first (speaker portrait or venue); without one the tile shows only the icon. */
  image?: ImageSourcePropType | null;
  /** Session-type glyph the tile swaps to on hover, focus or tap. */
  icon: ReactNode;
  /** Hue of the session type: tints the tile and its contour. */
  color: string;
  /** Names the tile for screen readers, e.g. the session type. */
  label: string;
  testID?: string;
  /** Overlay anchored to the tile corner, e.g. the on-agenda check. */
  children?: ReactNode;
}
