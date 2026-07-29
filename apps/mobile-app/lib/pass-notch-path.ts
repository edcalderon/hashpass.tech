/**
 * Shared geometry for the ticket-notch cutout mask: a rounded-rect card
 * silhouette with two circular holes subtracted at the notch positions,
 * expressed as a single SVG path using the even-odd fill rule. Used by both
 * the native mask (components/passes/PassNotchMask.tsx, fed to
 * MaskedView) and the web mask (an inline data: URI, since
 * @react-native-masked-view/masked-view has no real web implementation --
 * see PassNotchMask.web.tsx).
 */

const circlePath = (cx: number, cy: number, r: number) =>
  `M ${cx - r},${cy} ` +
  `A ${r},${r} 0 1 0 ${cx + r},${cy} ` +
  `A ${r},${r} 0 1 0 ${cx - r},${cy} Z`;

const roundedRectPath = (width: number, height: number, r: number) =>
  `M ${r},0 H ${width - r} A ${r},${r} 0 0 1 ${width},${r} ` +
  `V ${height - r} A ${r},${r} 0 0 1 ${width - r},${height} ` +
  `H ${r} A ${r},${r} 0 0 1 0,${height - r} ` +
  `V ${r} A ${r},${r} 0 0 1 ${r},0 Z`;

export interface NotchMaskGeometry {
  width: number;
  height: number;
  cornerRadius: number;
  notchRadius: number;
  /** Where the notch sits, as a fraction of height (0.58 = the perforation line). */
  notchYRatio: number;
}

export const buildNotchMaskPath = ({
  width,
  height,
  cornerRadius,
  notchRadius,
  notchYRatio,
}: NotchMaskGeometry): string => {
  const notchY = height * notchYRatio;
  return [
    roundedRectPath(width, height, cornerRadius),
    circlePath(0, notchY, notchRadius),
    circlePath(width, notchY, notchRadius),
  ].join(' ');
};

export const buildNotchMaskSvgMarkup = (geometry: NotchMaskGeometry): string => {
  const { width, height } = geometry;
  const d = buildNotchMaskPath(geometry);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="none"><path d="${d}" fill="#000" fill-rule="evenodd"/></svg>`
  );
};

export const buildNotchMaskDataUri = (geometry: NotchMaskGeometry): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(buildNotchMaskSvgMarkup(geometry))}`;
