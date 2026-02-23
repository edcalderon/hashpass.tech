"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";

interface LampContainerProps {
  children: React.ReactNode;
  className?: string;
  theme?: "dark" | "light";
}

const getThemeStyles = (theme: "dark" | "light") => {
  if (theme === "light") {
    return {
      container: "bg-slate-100",
      mask: "bg-slate-100",
      glow: "bg-red-500/35",
      glowSoft: "bg-red-400/45",
      beam: "bg-red-500/70",
      coneColor: "#ef4444",
    };
  }

  return {
    container: "bg-slate-950",
    mask: "bg-slate-950",
    glow: "bg-cyan-500/60",
    glowSoft: "bg-cyan-300/70",
    beam: "bg-cyan-300/90",
    coneColor: "#38bdf8",
  };
};

export function LampContainer({ children, className, theme = "dark" }: LampContainerProps) {
  const themeStyles = getThemeStyles(theme);

  return (
    <div
      className={cn(
        "relative flex min-h-[360px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl",
        themeStyles.container,
        className
      )}
    >
      <div className="relative flex w-full flex-1 scale-y-125 items-center justify-center isolate z-0">
        <motion.div
          initial={{ opacity: 0.45, width: "14rem" }}
          whileInView={{ opacity: 1, width: "28rem" }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          style={{
            backgroundImage:
              `conic-gradient(from 70deg at center top, ${themeStyles.coneColor}, transparent 42%)`,
          }}
          className="absolute right-1/2 h-56 w-[28rem]"
        >
          <div
            className={cn(
              "absolute bottom-0 left-0 z-20 h-40 w-full [mask-image:linear-gradient(to_top,white,transparent)]",
              themeStyles.mask
            )}
          />
          <div
            className={cn(
              "absolute bottom-0 left-0 z-20 h-full w-40 [mask-image:linear-gradient(to_right,white,transparent)]",
              themeStyles.mask
            )}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0.45, width: "14rem" }}
          whileInView={{ opacity: 1, width: "28rem" }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          style={{
            backgroundImage:
              `conic-gradient(from 290deg at center top, transparent 58%, ${themeStyles.coneColor})`,
          }}
          className="absolute left-1/2 h-56 w-[28rem]"
        >
          <div
            className={cn(
              "absolute bottom-0 right-0 z-20 h-full w-40 [mask-image:linear-gradient(to_left,white,transparent)]",
              themeStyles.mask
            )}
          />
          <div
            className={cn(
              "absolute bottom-0 right-0 z-20 h-40 w-full [mask-image:linear-gradient(to_top,white,transparent)]",
              themeStyles.mask
            )}
          />
        </motion.div>

        <div className={cn("absolute top-1/2 h-44 w-full translate-y-10 scale-x-150 blur-2xl", themeStyles.mask)} />
        <div className={cn("absolute top-1/2 z-30 h-36 w-[28rem] -translate-y-1/2 rounded-full blur-3xl", themeStyles.glow)} />
        <motion.div
          initial={{ width: "8rem" }}
          whileInView={{ width: "16rem" }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          className={cn("absolute z-40 h-36 w-64 -translate-y-[5.5rem] rounded-full blur-2xl", themeStyles.glowSoft)}
        />
        <motion.div
          initial={{ width: "14rem" }}
          whileInView={{ width: "28rem" }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          className={cn("absolute z-40 h-0.5 w-[28rem] -translate-y-[6.2rem]", themeStyles.beam)}
        />
        <div className={cn("absolute z-20 h-40 w-full -translate-y-[10rem]", themeStyles.mask)} />
      </div>

      <div className="relative z-50 -translate-y-10 px-5">{children}</div>
    </div>
  );
}

export interface LampBrandBannerProps {
  logoSrc?: string;
  logoSrcDark?: string;
  logoSrcLight?: string;
  logoFallbackSrc?: string;
  isDarkMode?: boolean;
  logoAlt?: string;
  className?: string;
}

export default function LampBrandBanner({
  logoSrc,
  logoSrcDark,
  logoSrcLight,
  logoFallbackSrc,
  isDarkMode = true,
  logoAlt = "Event brand",
  className,
}: LampBrandBannerProps) {
  const resolvedLogoSrc =
    logoSrc ||
    (isDarkMode ? logoSrcDark : logoSrcLight) ||
    logoFallbackSrc ||
    "";
  const animationKey = `${isDarkMode ? "dark" : "light"}-${resolvedLogoSrc || "fallback"}`;

  return (
    <LampContainer key={animationKey} className={className} theme={isDarkMode ? "dark" : "light"}>
      {resolvedLogoSrc ? (
        <motion.img
          src={resolvedLogoSrc}
          alt={logoAlt}
          initial={{ opacity: 0.5, y: 36, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: false, amount: 0.6 }}
          transition={{ delay: 0.28, duration: 0.8, ease: "easeInOut" }}
          className="h-auto w-[min(440px,84vw)] object-contain"
        />
      ) : (
        <motion.h2
          initial={{ opacity: 0.5, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.6 }}
          transition={{ delay: 0.28, duration: 0.8, ease: "easeInOut" }}
          className={cn(
            "text-center text-3xl font-semibold",
            isDarkMode ? "text-slate-200" : "text-red-500/70"
          )}
        >
          Event Brand
        </motion.h2>
      )}
    </LampContainer>
  );
}
