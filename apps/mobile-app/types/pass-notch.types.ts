export interface PerforationDotGeometry {
  /** Radius of each punched dot, in card units. */
  radius: number;
  /** Center-to-center distance between dots. */
  spacing: number;
  /** Inset from each side hole's outer edge to the first/last dot. */
  margin: number;
}

export interface NotchMaskGeometry {
  width: number;
  height: number;
  cornerRadius: number;
  notchRadius: number;
  /** Where the notch sits, as a fraction of height (0.58 = the perforation line). */
  notchYRatio: number;
  /**
   * When set, a row of small punched dots is cut between the side holes so
   * the whole perforation section is genuinely see-through (a die-cut
   * ticket, not a painted dashed line). Dots sit on the same center line as
   * the side holes.
   */
  perforationDots?: PerforationDotGeometry;
}
