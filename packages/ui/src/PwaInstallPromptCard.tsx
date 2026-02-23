"use client";

import React, { useId, useMemo, useState } from "react";

export interface PwaInstallPromptCardProps {
  appName?: string;
  logoSrc?: string;
  logoAlt?: string;
  logoLayout?: "icon" | "full";
  title?: string;
  description?: string;
  details?: string[];
  infoIntro?: string;
  primaryLabel?: string;
  infoLabel?: string;
  closeLabel?: string;
  dialogLabel?: string;
  collapsed?: boolean;
  collapsedLabel?: string;
  className?: string;
  showInfoToggle?: boolean;
  onPrimaryAction: () => void;
  onClose?: () => void;
  onExpand?: () => void;
}

const DEFAULT_DETAILS = [
  "Adds HashPass to your home screen for one-tap access.",
  "Runs full-screen like an app with fewer browser distractions.",
  "Keeps key screens cached for faster loading and better reliability.",
];

const sanitizeScope = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, "");

export default function PwaInstallPromptCard({
  appName = "HashPass",
  logoSrc,
  logoAlt = "HashPass logo",
  logoLayout = "icon",
  title,
  description,
  details = DEFAULT_DETAILS,
  infoIntro = "A PWA (Progressive Web App) lets HashPass behave like a native app on your device.",
  primaryLabel = "Install HashPass",
  infoLabel = "What is this?",
  closeLabel = "Close install prompt",
  dialogLabel,
  collapsed = false,
  collapsedLabel = "Expand install prompt",
  className = "",
  showInfoToggle = true,
  onPrimaryAction,
  onClose,
  onExpand,
}: PwaInstallPromptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const scopeId = useId();
  const scopeClass = useMemo(() => `hp-pwa-${sanitizeScope(scopeId)}`, [scopeId]);
  const isFullLogo = Boolean(logoSrc && logoLayout === "full");

  const cardTitle = title || `Install ${appName}`;
  const cardDescription =
    description ||
    "Add HashPass to your phone for a faster, app-like experience.";
  const dialogAriaLabel = dialogLabel || `${appName} install prompt`;
  const collapseAriaLabel = collapsedLabel || dialogAriaLabel;

  return (
    <div className={`${scopeClass} ${className}`.trim()}>
      <style>{`
        .${scopeClass} {
          font-family: "Inter", "Avenir Next", "Segoe UI", sans-serif;
          color: #f4f7ff;
        }

        .${scopeClass}.hp-pwa-floating {
          position: fixed;
          right: 16px;
          bottom: max(16px, env(safe-area-inset-bottom));
          z-index: 1000;
        }

        .${scopeClass}.hp-pwa-collapsed-state {
          width: auto;
        }

        .${scopeClass} .hp-pwa-collapsed {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          border: 1px solid rgba(147, 197, 253, 0.58);
          background: linear-gradient(160deg, rgba(23, 47, 126, 0.94), rgba(6, 10, 30, 0.96));
          box-shadow: 0 12px 24px rgba(10, 18, 50, 0.45);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .${scopeClass} .hp-pwa-collapsed:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(24, 46, 118, 0.52);
        }

        .${scopeClass} .hp-pwa-collapsed:active {
          transform: translateY(1px);
        }

        .${scopeClass} .hp-pwa-collapsed-icon {
          width: 20px;
          height: 20px;
          display: block;
        }

        .${scopeClass} .hp-pwa-card {
          --card-bg: rgba(8, 12, 30, 0.92);
          --card-border: rgba(122, 162, 255, 0.4);
          --card-shadow: 0 18px 46px rgba(7, 10, 20, 0.55);
          width: min(360px, calc(100vw - 24px));
          border-radius: 18px;
          border: 1px solid var(--card-border);
          background: linear-gradient(160deg, rgba(34, 52, 126, 0.88), var(--card-bg));
          box-shadow: var(--card-shadow);
          backdrop-filter: blur(10px);
          overflow: hidden;
          position: relative;
          padding: 14px;
        }

        .${scopeClass} .hp-pwa-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at top right, rgba(83, 181, 255, 0.18), transparent 52%);
        }

        .${scopeClass} .hp-pwa-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .${scopeClass} .hp-pwa-brand {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
          padding-right: 8px;
        }

        .${scopeClass} .hp-pwa-logo-wrap {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.12);
          flex-shrink: 0;
          overflow: hidden;
        }

        .${scopeClass} .hp-pwa-logo-wrap.hp-pwa-logo-wrap-full {
          width: 116px;
          height: 34px;
          border-radius: 8px;
          padding: 4px 8px;
        }

        .${scopeClass} .hp-pwa-logo {
          width: 32px;
          height: 32px;
          object-fit: contain;
          display: block;
        }

        .${scopeClass} .hp-pwa-logo.hp-pwa-logo-full {
          width: 100%;
          height: 100%;
        }

        .${scopeClass} .hp-pwa-brand-copy {
          min-width: 0;
          padding-top: 1px;
        }

        .${scopeClass} .hp-pwa-name {
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(226, 235, 255, 0.84);
          margin: 0 0 2px 0;
        }

        .${scopeClass} .hp-pwa-title {
          margin: 0;
          font-size: 1.02rem;
          line-height: 1.2;
          font-weight: 650;
          color: #ffffff;
          max-width: 160px;
        }

        .${scopeClass} .hp-pwa-close {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(3, 8, 28, 0.55);
          color: rgba(236, 242, 255, 0.9);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          transition: transform 180ms ease, background-color 180ms ease;
        }

        .${scopeClass} .hp-pwa-close-icon {
          width: 12px;
          height: 12px;
          display: block;
        }

        .${scopeClass} .hp-pwa-close:hover {
          background: rgba(133, 164, 255, 0.2);
          transform: translateY(-1px);
        }

        .${scopeClass} .hp-pwa-description {
          margin: 11px 0 12px 0;
          font-size: 0.86rem;
          line-height: 1.45;
          color: rgba(223, 234, 255, 0.9);
        }

        @property --gradient-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        .${scopeClass} .hp-pwa-shiny {
          --shine-bg: #0b0f24;
          --shine-bg-subtle: #1e2553;
          --shine-fg: #ffffff;
          --shine-highlight: #60a5fa;
          --shine-highlight-soft: #93c5fd;
          --shine-percent: 10%;
          --shine-angle: 0deg;

          width: 100%;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid transparent;
          padding: 0.78rem 1.06rem;
          font-size: 0.94rem;
          font-weight: 620;
          color: var(--shine-fg);
          cursor: pointer;
          outline-offset: 3px;
          background:
            linear-gradient(var(--shine-bg), var(--shine-bg)) padding-box,
            conic-gradient(
              from var(--shine-angle),
              transparent,
              var(--shine-highlight) var(--shine-percent),
              white calc(var(--shine-percent) * 1.7),
              var(--shine-highlight-soft) calc(var(--shine-percent) * 2.4),
              transparent calc(var(--shine-percent) * 3)
            ) border-box;
          box-shadow: inset 0 0 0 1px var(--shine-bg-subtle), 0 10px 24px rgba(40, 104, 255, 0.35);
          animation: hp-pwa-rotate 3.1s linear infinite;
          transition: transform 180ms ease, box-shadow 220ms ease;
        }

        .${scopeClass} .hp-pwa-shiny::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(100deg, transparent 22%, rgba(255, 255, 255, 0.24), transparent 78%);
          transform: translateX(-120%);
          animation: hp-pwa-sheen 2.9s ease-in-out infinite;
          pointer-events: none;
        }

        .${scopeClass} .hp-pwa-shiny:hover {
          transform: translateY(-1px);
          box-shadow: inset 0 0 0 1px var(--shine-bg-subtle), 0 14px 28px rgba(64, 137, 255, 0.42);
        }

        .${scopeClass} .hp-pwa-shiny:active {
          transform: translateY(1px);
        }

        .${scopeClass} .hp-pwa-info-toggle {
          width: 100%;
          margin-top: 10px;
          border: 1px solid rgba(147, 197, 253, 0.28);
          background: rgba(6, 12, 33, 0.48);
          color: rgba(220, 232, 255, 0.95);
          border-radius: 10px;
          padding: 0.54rem 0.78rem;
          font-size: 0.81rem;
          font-weight: 560;
          text-align: left;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background-color 180ms ease, border-color 180ms ease;
        }

        .${scopeClass} .hp-pwa-info-toggle:hover {
          background: rgba(40, 92, 211, 0.22);
          border-color: rgba(147, 197, 253, 0.5);
        }

        .${scopeClass} .hp-pwa-info-panel {
          margin-top: 9px;
          padding: 10px 11px;
          border-radius: 10px;
          background: rgba(3, 8, 24, 0.54);
          border: 1px solid rgba(133, 164, 255, 0.22);
          color: rgba(226, 236, 255, 0.92);
        }

        .${scopeClass} .hp-pwa-info-intro {
          margin: 0 0 7px 0;
          font-size: 0.8rem;
          line-height: 1.45;
        }

        .${scopeClass} .hp-pwa-info-list {
          margin: 0;
          padding-left: 17px;
          font-size: 0.77rem;
          line-height: 1.45;
          display: grid;
          row-gap: 5px;
        }

        .${scopeClass} .hp-pwa-chevron {
          font-size: 12px;
          transform: rotate(0deg);
          transition: transform 180ms ease;
        }

        .${scopeClass} .hp-pwa-chevron.hp-pwa-open {
          transform: rotate(180deg);
        }

        @keyframes hp-pwa-rotate {
          to {
            --shine-angle: 360deg;
          }
        }

        @keyframes hp-pwa-sheen {
          0% { transform: translateX(-120%); }
          48% { transform: translateX(130%); }
          100% { transform: translateX(130%); }
        }

        @media (max-width: 640px) {
          .${scopeClass}.hp-pwa-floating {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            bottom: max(12px, env(safe-area-inset-bottom));
          }

          .${scopeClass}.hp-pwa-floating.hp-pwa-collapsed-state {
            left: auto;
            right: 12px;
            transform: none;
          }

          .${scopeClass} .hp-pwa-card {
            width: min(94vw, 460px);
            border-radius: 16px;
          }

          .${scopeClass} .hp-pwa-title {
            max-width: 140px;
          }
        }
      `}</style>

      {collapsed ? (
        <button
          type="button"
          className="hp-pwa-collapsed"
          onClick={onExpand || onPrimaryAction}
          aria-label={collapseAriaLabel}
          title={collapseAriaLabel}
        >
          <svg className="hp-pwa-collapsed-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M7 11L12 16L17 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 20H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
      <div className="hp-pwa-card" role="dialog" aria-label={dialogAriaLabel}>
        <div className="hp-pwa-top">
          <div className="hp-pwa-brand">
            <div
              className={`hp-pwa-logo-wrap ${isFullLogo ? "hp-pwa-logo-wrap-full" : ""}`}
              aria-hidden={logoSrc ? undefined : true}
            >
              {logoSrc ? (
                <img src={logoSrc} alt={logoAlt} className={`hp-pwa-logo ${isFullLogo ? "hp-pwa-logo-full" : ""}`} />
              ) : (
                <span>{appName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="hp-pwa-brand-copy">
              <p className="hp-pwa-name">{appName}</p>
              <h3 className="hp-pwa-title">{cardTitle}</h3>
            </div>
          </div>

          {onClose && (
            <button type="button" className="hp-pwa-close" onClick={onClose} aria-label={closeLabel}>
              <svg className="hp-pwa-close-icon" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 2L10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M10 2L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <p className="hp-pwa-description">{cardDescription}</p>

        <button type="button" className="hp-pwa-shiny" onClick={onPrimaryAction}>
          <span>{primaryLabel}</span>
        </button>

        {showInfoToggle && (
          <>
            <button
              type="button"
              className="hp-pwa-info-toggle"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
            >
              <span>{infoLabel}</span>
              <span className={`hp-pwa-chevron ${expanded ? "hp-pwa-open" : ""}`}>v</span>
            </button>

            {expanded && (
              <div className="hp-pwa-info-panel">
                <p className="hp-pwa-info-intro">{infoIntro}</p>
                <ul className="hp-pwa-info-list">
                  {details.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
