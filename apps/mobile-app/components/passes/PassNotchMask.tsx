import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface PassNotchMaskProps {
  /** Design-reference size the notch geometry is authored against. Height
   *  always matches the real render (PASS_CARD_HEIGHT is fixed, never
   *  responsive); width is stretched to fit via preserveAspectRatio="none"
   *  when the actual card is narrower on small phones, which very slightly
   *  ovals the notch circles rather than requiring the real pixel width to
   *  be threaded down as a prop. */
  width: number;
  height: number;
  cornerRadius: number;
  notchRadius: number;
  /** Where the notch sits, as a fraction of height (0.58 = the perforation line). */
  notchYRatio: number;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M ${cx - r},${cy} ` +
  `A ${r},${r} 0 1 0 ${cx + r},${cy} ` +
  `A ${r},${r} 0 1 0 ${cx - r},${cy} Z`;

const roundedRectPath = (width: number, height: number, r: number) =>
  `M ${r},0 H ${width - r} A ${r},${r} 0 0 1 ${width},${r} ` +
  `V ${height - r} A ${r},${r} 0 0 1 ${width - r},${height} ` +
  `H ${r} A ${r},${r} 0 0 1 0,${height - r} ` +
  `V ${r} A ${r},${r} 0 0 1 ${r},0 Z`;

/**
 * Mask geometry for MaskedView: the card's rounded-rect silhouette with two
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
const PassNotchMask: React.FC<PassNotchMaskProps> = ({
  width,
  height,
  cornerRadius,
  notchRadius,
  notchYRatio,
}) => {
  const notchY = height * notchYRatio;
  const d = [
    roundedRectPath(width, height, cornerRadius),
    circlePath(0, notchY, notchRadius),
    circlePath(width, notchY, notchRadius),
  ].join(' ');

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Path d={d} fill="#FFFFFF" fillRule="evenodd" />
    </Svg>
  );
};

export default PassNotchMask;
