import React from "react";
import { View } from "react-native";

export interface AnimatedGradientBackgroundProps {
  startingGap?: number;
  Breathing?: boolean;
  gradientColors?: string[];
  gradientStops?: number[];
  animationSpeed?: number;
  breathingRange?: number;
  driftSpeed?: number;
  driftStrengthX?: number;
  driftStrengthY?: number;
  containerStyle?: object;
  containerClassName?: string;
  topOffset?: number;
}

// On native, CrystalForgeBackground / AnimatedGradientBackground already
// provided by the native background. Return null to avoid DOM-only deps.
const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = () => null;

export default AnimatedGradientBackground;
