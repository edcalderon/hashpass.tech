"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";

const DEFAULT_GRADIENT_COLORS = [
  "#0A0A0A",
  "#2979FF",
  "#FF80AB",
  "#FF6D00",
  "#FFD600",
  "#00E676",
  "#3D5AFE",
];

const DEFAULT_GRADIENT_STOPS = [35, 50, 60, 70, 80, 90, 100];

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
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  topOffset?: number;
}

const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 125,
  Breathing = false,
  gradientColors,
  gradientStops,
  animationSpeed = 0.02,
  breathingRange = 5,
  driftSpeed = 0,
  driftStrengthX = 0,
  driftStrengthY = 0,
  containerStyle = {},
  topOffset = 0,
  containerClassName = "",
}) => {
  const colors = useMemo(() => gradientColors ?? DEFAULT_GRADIENT_COLORS, [gradientColors]);
  const stops = useMemo(() => gradientStops ?? DEFAULT_GRADIENT_STOPS, [gradientStops]);

  if (colors.length !== stops.length) {
    throw new Error(
      `gradientColors and gradientStops must have the same length. Received ${colors.length} and ${stops.length}.`
    );
  }

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animationFrame = 0;
    let width = startingGap;
    let directionWidth = 1;
    let phase = 0;

    const gradientStopsString = stops
      .map((stop, index) => `${colors[index]} ${stop}%`)
      .join(", ");

    const animateGradient = () => {
      if (width >= startingGap + breathingRange) directionWidth = -1;
      if (width <= startingGap - breathingRange) directionWidth = 1;
      if (!Breathing) directionWidth = 0;

      width += directionWidth * animationSpeed;
      phase += driftSpeed;

      const centerX = 50 + Math.sin(phase) * driftStrengthX;
      const centerY = 20 + Math.cos(phase * 0.9) * driftStrengthY;

      const gradient = `radial-gradient(${width}% ${width + topOffset}% at ${centerX}% ${centerY}%, ${gradientStopsString})`;

      if (containerRef.current) {
        containerRef.current.style.background = gradient;
      }

      animationFrame = requestAnimationFrame(animateGradient);
    };

    animationFrame = requestAnimationFrame(animateGradient);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    startingGap,
    Breathing,
    colors,
    stops,
    animationSpeed,
    breathingRange,
    driftSpeed,
    driftStrengthX,
    driftStrengthY,
    topOffset,
  ]);

  return (
    <motion.div
      key="animated-gradient-background"
      initial={{ opacity: 0, scale: 1.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: {
          duration: 2,
          ease: [0.25, 0.1, 0.25, 1],
        },
      }}
      className={cn("absolute inset-0 overflow-hidden pointer-events-none", containerClassName)}
    >
      <div
        ref={containerRef}
        style={containerStyle}
        className="absolute inset-0 transition-transform"
      />
    </motion.div>
  );
};

export default AnimatedGradientBackground;
