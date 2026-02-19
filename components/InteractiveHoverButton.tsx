import React from "react";
import { ArrowRight } from "lucide-react-native";
import { cn } from "../lib/utils";

interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text = "Button", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "group relative w-40 cursor-pointer overflow-hidden rounded-full border-2 border-cyan-500/20 bg-cyan-500/10 p-3 text-center font-semibold text-cyan-500 transition-all duration-300 hover:bg-cyan-500/20 hover:text-cyan-400 dark:border-cyan-400/20 dark:bg-cyan-500/10 dark:text-cyan-400 dark:hover:bg-cyan-500/20",
        className,
      )}
      {...props}
    >
      <span className="inline-block translate-x-3 transition-all duration-300 group-hover:translate-x-16 group-hover:opacity-0">
        {text}
      </span>
      <div className="absolute top-0 z-10 flex h-full w-full translate-x-16 items-center justify-center gap-3 text-cyan-400 opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100 dark:text-cyan-300">
        <span className="whitespace-nowrap">{text}</span>
        <ArrowRight className="w-5 h-5" />
      </div>
      <div className="absolute left-[20%] top-[40%] h-2 w-2 scale-[1] rounded-lg bg-red-500 transition-all duration-300 group-hover:left-[0%] group-hover:top-[0%] group-hover:h-full group-hover:w-full group-hover:scale-[1.8] group-hover:bg-red-600/80 dark:bg-red-400 dark:group-hover:bg-red-400/80"></div>
    </button>
  );
});

InteractiveHoverButton.displayName = "InteractiveHoverButton";

export { InteractiveHoverButton };
