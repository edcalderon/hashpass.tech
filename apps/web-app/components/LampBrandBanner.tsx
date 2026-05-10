"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";

interface LampContainerProps {
  children: React.ReactNode;
  className?: string;
  backgroundColor?: string;
  accentColor?: string;
}

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length === 3) {
    const r = normalized[0];
    const g = normalized[1];
    const b = normalized[2];
    return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`;
  }

  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return hex;
};

export function LampContainer({
  children,
  className,
  backgroundColor = "#07111F",
  accentColor = "#6FDDFD",
}: LampContainerProps) {
  const softAccent = hexToRgba(accentColor, 0.28);
  const beamAccent = hexToRgba(accentColor, 0.5);

  return (
    <div
      className={cn(
        "relative flex min-h-[360px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl",
        className
      )}
      style={{ backgroundColor }}
    >
      <div className="relative flex w-full flex-1 scale-y-125 items-center justify-center isolate z-0">
        <motion.div
          initial={{ opacity: 0.35, scaleX: 0.88, scaleY: 0.85 }}
          whileInView={{ opacity: 1, scaleX: 1, scaleY: 1 }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, ${beamAccent} 0%, ${softAccent} 22%, transparent 68%)`,
          }}
          className="absolute top-0 h-64 w-[34rem]"
        >
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 h-44 [mask-image:linear-gradient(to_top,white,transparent)]",
              "bg-transparent"
            )}
          />
          <div
            className={cn(
              "absolute left-1/2 top-0 z-20 h-56 w-20 -translate-x-1/2 rounded-full blur-3xl",
              "bg-transparent"
            )}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0.32, scaleX: 0.88, scaleY: 0.85 }}
          whileInView={{ opacity: 1, scaleX: 1, scaleY: 1 }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, ${softAccent} 0%, transparent 66%)`,
          }}
          className="absolute top-0 h-64 w-[34rem]"
        />

        <motion.div
          initial={{ opacity: 0.2, scaleX: 0.65 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: false, amount: 0.5 }}
          transition={{ delay: 0.2, duration: 0.75, ease: "easeInOut" }}
          className="absolute top-0 z-40 h-1 w-[26rem] -translate-y-[5rem] rounded-full blur-sm"
          style={{ backgroundColor: beamAccent }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,0.15)_100%)]" />
      </div>

      <div className="relative z-50 -translate-y-6 px-5">{children}</div>
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
  backgroundColor?: string;
  accentColor?: string;
}

export default function LampBrandBanner({
  logoSrc,
  logoSrcDark,
  logoSrcLight,
  logoFallbackSrc,
  isDarkMode = true,
  logoAlt = "Event brand",
  className,
  backgroundColor,
  accentColor,
}: LampBrandBannerProps) {
  const resolvedLogoSrc =
    logoSrc ||
    (isDarkMode ? logoSrcDark : logoSrcLight) ||
    logoFallbackSrc ||
    "";
  const animationKey = [
    isDarkMode ? "dark" : "light",
    backgroundColor || "default-bg",
    accentColor || "default-accent",
    resolvedLogoSrc || "fallback",
  ].join("-");

  return (
    <LampContainer
      key={animationKey}
      className={className}
      backgroundColor={backgroundColor}
      accentColor={accentColor}
    >
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
