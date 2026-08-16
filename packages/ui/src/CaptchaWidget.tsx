"use client";

import { useEffect, useRef } from "react";

const CAP_WIDGET_CDN_URL = "https://unpkg.com/@cap.js/widget@0.1.56";

// Loads cap-widget from CDN rather than bundling it, so RN Metro/web
// bundlers never try to process this browser-only custom element package.
// Uses customElements.whenDefined so callers don't have to guess when it's
// ready. Originally inline in apps/mobile-app/components/Newsletter.web.tsx.
function loadCapWidget(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (customElements.get("cap-widget")) return Promise.resolve();
  const existing = document.querySelector("script[data-cap-widget]");
  if (existing) return customElements.whenDefined("cap-widget").then(() => undefined);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = CAP_WIDGET_CDN_URL;
    script.dataset.capWidget = "";
    script.addEventListener("load", () =>
      customElements.whenDefined("cap-widget").then(() => resolve()).catch(reject)
    );
    script.addEventListener("error", () => reject(new Error("Failed to load security check script")));
    document.head.appendChild(script);
  });
}

export interface CaptchaWidgetProps {
  /** Base URL cap-widget posts challenge/redeem requests to, e.g. `${apiOrigin}/api/captcha`. */
  apiEndpoint: string;
  onSolve: (token: string) => void;
  onReset?: () => void;
  onError?: (message: string) => void;
  /** Cap's built-in language pack key (es, fr, de, pt, ru, ja, ar, hi); omit for Cap's default English strings. */
  lang?: string;
  /** Explicit label overrides for locales without a built-in Cap language pack (e.g. Korean -- see Newsletter.web.tsx's KO_I18N for the exact key set). */
  i18nOverrides?: Record<string, string>;
  /** Bump this to force the widget to remount and issue a fresh challenge -- e.g. after a submit consumes the token, or a captchaExpired response. */
  resetKey?: number | string;
  disableHaptics?: boolean;
  className?: string;
}

/**
 * Mounts cap.js's proof-of-work captcha widget (https://capjs.js.org) -- no
 * third-party keys, solved entirely client-side. Shared across every
 * HASHPASS surface that needs bot protection on a mutating endpoint;
 * extracted from the newsletter signup's original inline implementation so
 * new surfaces (e.g. QR link creation) reuse the same CDN-loading/mount
 * lifecycle instead of reimplementing it. Server-side counterpart:
 * packages/backend/src/captcha/cap-instance.ts.
 */
export function CaptchaWidget({
  apiEndpoint,
  onSolve,
  onReset,
  onError,
  lang,
  i18nOverrides,
  resetKey,
  disableHaptics = true,
  className,
}: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (widgetRef.current) return;
    let cancelled = false;

    let onSolveEvent: ((event: Event) => void) | null = null;
    let onResetEvent: (() => void) | null = null;
    let onErrorEvent: ((event: Event) => void) | null = null;

    loadCapWidget()
      .then(() => {
        if (cancelled || widgetRef.current || !containerRef.current) return;

        try {
          const widget = document.createElement("cap-widget");
          widget.setAttribute("data-cap-api-endpoint", apiEndpoint);
          if (disableHaptics) widget.setAttribute("data-cap-disable-haptics", "");
          if (lang) widget.setAttribute("data-cap-lang", lang);
          for (const [key, value] of Object.entries(i18nOverrides ?? {})) {
            widget.setAttribute(`data-cap-i18n-${key}`, value);
          }

          onSolveEvent = (event: Event) => {
            const token = (event as CustomEvent<{ token: string }>).detail?.token;
            if (token) onSolve(token);
          };
          onResetEvent = () => onReset?.();
          onErrorEvent = (event: Event) => {
            const message = (event as CustomEvent<{ message?: string }>).detail?.message;
            onError?.(message ?? "Captcha error");
          };

          widget.addEventListener("solve", onSolveEvent);
          widget.addEventListener("reset", onResetEvent);
          widget.addEventListener("error", onErrorEvent);

          widgetRef.current = widget;
          containerRef.current.appendChild(widget);
        } catch (error) {
          if (!cancelled) onError?.(error instanceof Error ? error.message : "Captcha error");
        }
      })
      .catch((error) => {
        if (!cancelled) onError?.(error instanceof Error ? error.message : "Failed to load captcha widget");
      });

    return () => {
      cancelled = true;
      const widget = widgetRef.current;
      if (widget) {
        if (onSolveEvent) widget.removeEventListener("solve", onSolveEvent);
        if (onResetEvent) widget.removeEventListener("reset", onResetEvent);
        if (onErrorEvent) widget.removeEventListener("error", onErrorEvent);
        widget.remove();
        widgetRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiEndpoint, resetKey]);

  return <div ref={containerRef} className={className} />;
}

export default CaptchaWidget;
