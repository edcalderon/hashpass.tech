import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { buildNotchMaskPath, type NotchMaskGeometry } from '../../lib/pass-notch-path';

/**
 * Mask geometry for MaskedView (native only -- see NotchMaskedCard.web.tsx
 * for the web equivalent): the card's rounded-rect silhouette with two
 * circular holes subtracted at the ticket notch positions, via a single path
 * using the even-odd fill rule.
 *
 * This exists specifically because a plain View can't produce a real
 * "punched hole" -- a transparent child sitting in front of an opaque parent
 * still just reveals that same parent's own paint underneath it, not
 * whatever's actually behind the card in the screen's real compositing
 * stack. Combined with react-native-svg's evenodd path (a shape whose pixels
 * in the hole region have zero alpha natively, not stacked-transparent),
 * MaskedView reveals the true content behind the card there -- the next card
 * in the stack, or the page background, exactly like a die-cut ticket.
 */
const PassNotchMask: React.FC<NotchMaskGeometry> = (geometry) => {
  const { width, height } = geometry;
  const d = buildNotchMaskPath(geometry);

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Path d={d} fill="#FFFFFF" fillRule="evenodd" />
    </Svg>
  );
};

export default PassNotchMask;
