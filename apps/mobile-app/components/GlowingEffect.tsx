import { memo } from "react";

// No-op on native — GlowingEffect uses motion/react (web-only DOM APIs).
// Web version is in GlowingEffect.web.tsx.
interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
  isDarkMode?: boolean;
}

const GlowingEffect = memo((_props: GlowingEffectProps) => null);

GlowingEffect.displayName = "GlowingEffect";

export { GlowingEffect };
