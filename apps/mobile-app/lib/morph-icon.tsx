import React from "react";
import {
  MorphIcon as MorphiconsIcon,
  type IconInput,
  type MorphHandle,
  type SpringPreset,
} from "morphicons/react-native";
import { Ionicons } from "./vector-icons";

export type { IconInput, MorphHandle, SpringPreset };

interface MorphIconProps {
  /** Uncontrolled mode: current icon; changing this prop animates the morph. */
  icon?: IconInput;
  /** Controlled mode: source endpoint (used with `to`/`progress`, e.g. drag gestures). */
  from?: IconInput;
  /** Controlled mode: target endpoint. */
  to?: IconInput;
  /** Controlled mode: frozen 0..1 morph position. */
  progress?: number;
  spring?: SpringPreset;
  size?: number;
  color?: string;
  strokeWidth?: number;
  label?: string;
  testID?: string;
  /** Static Ionicons glyph name shown if the morph renderer throws at runtime. */
  fallbackIconName: string;
}

interface BoundaryState {
  hasError: boolean;
}

/**
 * react-native-svg has caused real production Android crashes in this repo
 * before (see apps/docs/docs/reference/mobile-app/native-module-version-pinning.md),
 * and MorphIcon draws through it directly — so this boundary exists to make a
 * morph-renderer failure degrade to a static icon instead of crashing the screen.
 */
class MorphIconBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.warn("[MorphIcon] render failed, using static fallback", error);
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export const MorphIcon = React.forwardRef<MorphHandle, MorphIconProps>(
  function MorphIcon(
    {
      icon,
      from,
      to,
      progress,
      spring = "snappy",
      size = 24,
      color = "currentColor",
      strokeWidth = 2,
      label,
      testID,
      fallbackIconName,
    },
    ref,
  ) {
    return (
      <MorphIconBoundary
        fallback={
          <Ionicons name={fallbackIconName} size={size} color={color} />
        }
      >
        <MorphiconsIcon
          ref={ref}
          icon={icon}
          from={from}
          to={to}
          progress={progress}
          spring={spring}
          size={size}
          color={color}
          strokeWidth={strokeWidth}
          label={label}
          testID={testID}
        />
      </MorphIconBoundary>
    );
  },
);
