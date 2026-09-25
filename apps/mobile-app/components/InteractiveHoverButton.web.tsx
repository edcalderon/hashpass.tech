import React from "react";
import { ArrowRight } from "lucide-react-native";
import { cn } from "../lib/utils";
import { uiPalette } from "@hashpass/ui/tokens";

interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  tone?: "light" | "dark";
}

const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text = "Button", tone = "light", className, ...props }, ref) => {
  const isDark = tone === "dark";
  const palette = uiPalette(isDark);
  const colors = {
    "--cta-accent": palette.accent,
    "--cta-fill": palette.accentFill,
    "--cta-soft": palette.accentSoft,
    "--cta-on-accent": palette.onAccent,
  } as React.CSSProperties;
  return (
    <button
      ref={ref}
      className={cn(
        "group/cta relative w-40 cursor-pointer overflow-hidden rounded-full border-2 border-[color:var(--cta-accent)] bg-[color:var(--cta-soft)] p-3 text-center font-semibold text-[color:var(--cta-accent)] transition-all duration-300 hover:bg-[color:var(--cta-fill)] hover:text-[color:var(--cta-on-accent)]",
        className,
      )}
      style={colors}
      {...props}
    >
      <span className="inline-block translate-x-3 transition-all duration-300 group-hover/cta:translate-x-16 group-hover/cta:opacity-0">
        {text}
      </span>
      <div className="absolute top-0 z-10 flex h-full w-full translate-x-16 items-center justify-center gap-3 text-[color:var(--cta-on-accent)] opacity-0 transition-all duration-300 group-hover/cta:-translate-x-1 group-hover/cta:opacity-100">
        <span className="whitespace-nowrap">{text}</span>
        <ArrowRight className="w-5 h-5" />
      </div>
      <div className="absolute left-[20%] top-[40%] h-2 w-2 scale-[1] rounded-lg bg-[color:var(--cta-accent)] transition-all duration-300 group-hover/cta:left-[0%] group-hover/cta:top-[0%] group-hover/cta:h-full group-hover/cta:w-full group-hover/cta:scale-[1.8] group-hover/cta:bg-[color:var(--cta-fill)]"></div>
    </button>
  );
});

InteractiveHoverButton.displayName = "InteractiveHoverButton";

export { InteractiveHoverButton };
