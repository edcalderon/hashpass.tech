'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useAvailableLocales, useLocale, useSetLocale } from '@hashpass/i18n';
import type { SupportedLocale } from '@hashpass/i18n';
import { useLandingAnimationModeOptional, type LandingAnimationMode } from './LandingAnimationProvider';
import { useTheme } from './ThemeProvider';

const LOCALE_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  ko: '🇰🇷',
  fr: '🇫🇷',
  pt: '🇧🇷',
  de: '🇩🇪',
};

type ClubSettingsMenuProps = {
  triggerStyle: CSSProperties;
};

const animationOptions: Array<{
  mode: LandingAnimationMode;
  label: string;
  description: string;
}> = [
  { mode: 'full', label: 'Full', description: 'Maximum visual motion' },
  { mode: 'low', label: 'Low', description: 'Balanced performance' },
  { mode: 'static', label: 'Static', description: 'No animated background' },
];

/**
 * Club uses the hero's cool-spectrum mesh as its interactive accent instead
 * of borrowing the mobile product's red action color. Keeping the palette
 * here makes the settings surface a small, portable web design system.
 */
const CLUB_SETTINGS_PALETTE = {
  dark: {
    panel: 'linear-gradient(150deg, rgba(19,34,64,0.985), rgba(8,18,39,0.985) 72%)',
    border: 'rgba(138,163,218,0.24)',
    surface: 'rgba(164,187,232,0.075)',
    hoverSurface: 'rgba(104,145,237,0.15)',
    text: '#f4f7ff',
    mutedText: 'rgba(207,218,240,0.70)',
    activeSurface: 'linear-gradient(135deg, #1678e5 0%, #386be7 52%, #735fd3 100%)',
    activeBorder: 'rgba(143,191,255,0.82)',
    activeShadow: '0 10px 22px rgba(42,102,220,0.30)',
  },
  light: {
    panel: 'linear-gradient(155deg, rgba(255,255,255,0.99), rgba(242,247,255,0.985))',
    border: 'rgba(77,107,166,0.20)',
    surface: 'rgba(44,79,145,0.055)',
    hoverSurface: 'rgba(65,108,207,0.10)',
    text: '#15213a',
    mutedText: 'rgba(31,51,88,0.62)',
    activeSurface: 'linear-gradient(135deg, #1764d7 0%, #3b64cb 58%, #6758bb 100%)',
    activeBorder: 'rgba(74,116,218,0.75)',
    activeShadow: '0 10px 22px rgba(39,91,194,0.22)',
  },
} as const;

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ position: 'absolute', inset: 0, margin: 'auto', display: 'block' }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.09A1.7 1.7 0 0 0 10.68 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15a1.7 1.7 0 0 0-1.55-1.03h-.09v-3h.09A1.7 1.7 0 0 0 7.02 9.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.55v-.09h3v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.09v3h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

export function ClubSettingsMenu({ triggerStyle }: ClubSettingsMenuProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const availableLocales = useAvailableLocales();
  const animationSettings = useLandingAnimationModeOptional();
  const [open, setOpen] = useState(false);
  const isDark = resolvedTheme === 'dark';
  const palette = isDark ? CLUB_SETTINGS_PALETTE.dark : CLUB_SETTINGS_PALETTE.light;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const selectionStyle = (active: boolean): CSSProperties => ({
    border: active ? `1px solid ${palette.activeBorder}` : `1px solid ${palette.border}`,
    background: active ? palette.activeSurface : palette.surface,
    boxShadow: active ? palette.activeShadow : 'none',
    color: active ? '#ffffff' : palette.text,
    borderRadius: 999,
    minHeight: 38,
    padding: '0 13px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    transition: 'transform 0.15s, background 0.15s, border-color 0.15s',
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Settings"
        style={{
          width: 36,
          height: 36,
          padding: 0,
          lineHeight: 0,
          borderRadius: '50%',
          cursor: 'pointer',
          position: 'relative',
          transition: 'opacity 0.15s, transform 0.15s',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          ...triggerStyle,
        }}
        onMouseEnter={(event) => { event.currentTarget.style.transform = 'rotate(18deg)'; }}
        onMouseLeave={(event) => { event.currentTarget.style.transform = 'rotate(0deg)'; }}
      >
        <GearIcon />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 99, border: 0, background: 'transparent', cursor: 'default' }}
          />
          <section
            className="club-settings-panel"
            role="dialog"
            aria-label="Club settings"
            style={{
              position: 'fixed',
              top: 72,
              right: 24,
              zIndex: 100,
              width: 'min(350px, calc(100vw - 32px))',
              maxHeight: 'min(620px, calc(100vh - 88px))',
              overflowY: 'auto',
              padding: 20,
              borderRadius: 22,
              border: `1px solid ${palette.border}`,
              background: palette.panel,
              boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.48)' : '0 24px 64px rgba(13,23,40,0.20)',
              color: palette.text,
              backdropFilter: 'blur(24px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
              animation: 'club-settings-in 0.18s cubic-bezier(0.22,1,0.36,1) both',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.13em', color: palette.mutedText, marginBottom: 12 }}>
              APPEARANCE
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {([
                ['dark', '☾  Dark'],
                ['system', '◐  Auto'],
                ['light', '☀  Light'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                  style={selectionStyle(theme === value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ height: 1, background: palette.border, margin: '18px 0' }} />
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.13em', color: palette.mutedText, marginBottom: 10 }}>
              LANGUAGE
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              {availableLocales.map((option) => {
                const active = option.code === locale;
                return (
                  <button
                    key={option.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setLocale(option.code as SupportedLocale); setOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      width: '100%',
                      minHeight: 48,
                      padding: '8px 10px',
                      border: 0,
                      borderRadius: 12,
                      background: active ? palette.surface : 'transparent',
                      color: palette.text,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(event) => { if (!active) event.currentTarget.style.background = palette.hoverSurface; }}
                    onMouseLeave={(event) => { if (!active) event.currentTarget.style.background = 'transparent'; }}
                  >
                    <span aria-hidden style={{ fontSize: 23, lineHeight: 1 }}>{LOCALE_FLAGS[option.code] ?? '🌐'}</span>
                    <span style={{ flex: 1, fontSize: 16, fontWeight: active ? 700 : 500 }}>{option.nativeName}</span>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        border: active ? `1px solid ${palette.activeBorder}` : `1px solid ${palette.border}`,
                        background: active ? palette.activeSurface : 'transparent',
                        boxShadow: active ? palette.activeShadow : 'none',
                        color: active ? '#fff' : palette.mutedText,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {active ? <CheckIcon /> : option.code.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>

            {animationSettings && (
              <>
                <div style={{ height: 1, background: palette.border, margin: '18px 0' }} />
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.13em', color: palette.mutedText, marginBottom: 12 }}>
                  LANDING MOTION
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
                  {animationOptions.map((option) => {
                    const active = animationSettings.animationMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        aria-label={`${option.label} animation: ${option.description}`}
                        aria-pressed={active}
                        onClick={() => animationSettings.setAnimationMode(option.mode)}
                        style={{
                          ...selectionStyle(active),
                          minHeight: 50,
                          padding: '7px 5px',
                          borderRadius: 12,
                          fontSize: 13,
                          lineHeight: 1.1,
                        }}
                      >
                        <span style={{ display: 'block' }}>{option.label}</span>
                        <span style={{ display: 'block', marginTop: 3, fontSize: 9, fontWeight: 600, opacity: active ? 0.82 : 0.62 }}>
                          {option.description.replace(' animation', '').replace(' background', '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <style>{`
        @keyframes club-settings-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 768px) {
          .club-settings-panel { right: 16px !important; }
        }
      `}</style>
    </div>
  );
}
