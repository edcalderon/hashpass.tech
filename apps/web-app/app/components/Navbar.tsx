'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@hashpass/i18n';
import { useLocale, useSetLocale, useAvailableLocales } from '@hashpass/i18n';
import type { SupportedLocale } from '@hashpass/i18n';
import { useTheme } from './ThemeProvider';
import { SignInModal } from './SignInModal';

// ── Pill / icon-button shared styles ─────────────────────────────────────────
type PillStyle = {
  bg: string;
  border: string;
  color: string;
};

function pillStyle(overHero: boolean, isDark: boolean): PillStyle {
  if (overHero) {
    return {
      bg: 'rgba(13,23,40,0.55)',
      border: 'rgba(255,255,255,0.16)',
      color: 'rgba(255,255,255,0.88)',
    };
  }
  return {
    bg: isDark ? 'rgba(13,23,40,0.80)' : 'rgba(255,255,255,0.82)',
    border: isDark ? 'rgba(163,183,214,0.22)' : 'rgba(100,120,180,0.22)',
    color: isDark ? 'rgba(245,247,251,0.88)' : '#0d1728',
  };
}

// Circular 36×36 pill button
function IconPill({
  children,
  onClick,
  ariaLabel,
  bg,
  border,
  color,
  accentBorder,
  title,
  style: extraStyle,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  bg: string;
  border: string;
  color: string;
  accentBorder?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: `1.5px solid ${accentBorder ?? border}`,
        background: bg,
        color,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.15s, transform 0.15s',
        flexShrink: 0,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        ...extraStyle,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {children}
    </button>
  );
}

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation('nav');
  const locale = useLocale();
  const setLocale = useSetLocale();
  const availableLocales = useAvailableLocales();
  const [scrolled, setScrolled] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { key: 'features', href: '#features' },
    { key: 'pricing',  href: '#pricing' },
    { key: 'docs',     href: '/documentation/' },
  ] as const;

  const overHero = !scrolled;
  const isDark   = resolvedTheme === 'dark';

  const pill = pillStyle(overHero, isDark);
  const linkColor      = overHero ? 'rgba(255,255,255,0.80)' : 'var(--text-secondary)';
  const linkHoverColor = overHero ? '#ffffff' : 'var(--text-primary)';

  // Accent border tints for each control
  const themeBorder   = overHero ? 'rgba(0,229,255,0.55)' : isDark ? 'rgba(41,121,255,0.55)' : 'rgba(25,118,210,0.40)';
  const signInBorder  = overHero ? 'rgba(255,64,129,0.65)' : isDark ? 'rgba(233,30,140,0.55)' : 'rgba(194,24,91,0.45)';
  const signInColor   = overHero ? 'rgba(255,130,170,0.95)' : isDark ? '#ff80ab' : '#c2185b';

  return (
    <>
      <header
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 100,
          transition: 'background 0.35s, border-color 0.35s, box-shadow 0.35s',
          background: scrolled ? 'var(--nav-bg)' : 'transparent',
          borderBottom: scrolled ? '1px solid var(--nav-border)' : '1px solid transparent',
          backdropFilter: scrolled ? 'blur(22px) saturate(1.5)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(22px) saturate(1.5)' : 'none',
          boxShadow: scrolled ? 'var(--shadow-sm)' : 'none',
        }}
      >
        <nav
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '0 24px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* ── Logo ── */}
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              flexShrink: 0,
              textDecoration: 'none',
              position: 'relative',
              zIndex: 1,
              backgroundColor: 'transparent',
              isolation: 'isolate',
            }}
          >
            <img
              src={overHero
                ? '/logo-full-hashpass-white-cyan.svg'
                : isDark
                  ? '/logo-full-hashpass-white-cyan.svg'
                  : '/logo-full-hashpass-black-cyan.svg'}
              alt="HashPass"
              style={{
                display: 'block',
                width: 'clamp(80px, 12vw, 140px)',
                height: 'auto',
                flexShrink: 0,
                filter: isDark && !overHero ? 'hue-rotate(320deg) saturate(1.2)' : 'none',
                transition: 'filter 0.3s, opacity 0.3s',
              }}
            />
            <span
              style={{
                fontSize: 'clamp(9px, 1.5vw, 11px)',
                fontWeight: 600,
                color: overHero ? 'rgba(255,255,255,0.48)' : 'var(--text-faint)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: 0.3,
                transition: 'color 0.3s',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              .club
            </span>
          </Link>

          {/* ── Desktop nav links ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} className="nav-links-desktop">
            {navLinks.map(({ key, href }) => (
              href.startsWith('/') ? (
                <Link
                  key={key}
                  href={href}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    color: linkColor,
                    transition: 'color 0.2s, background 0.2s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = linkHoverColor;
                    el.style.background = overHero ? 'rgba(255,255,255,0.1)' : 'var(--bg-overlay)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = linkColor;
                    el.style.background = 'transparent';
                  }}
                >
                  {t(key)}
                </Link>
              ) : (
                <a
                  key={key}
                  href={href}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    color: linkColor,
                    transition: 'color 0.2s, background 0.2s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = linkHoverColor;
                    el.style.background = overHero ? 'rgba(255,255,255,0.1)' : 'var(--bg-overlay)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = linkColor;
                    el.style.background = 'transparent';
                  }}
                >
                  {t(key)}
                </a>
              )
            ))}
          </div>

          {/* ── Right controls: mobile-style pill icons ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

            {/* Language picker */}
            <div style={{ position: 'relative' }}>
              <IconPill
                onClick={() => setLangOpen((v) => !v)}
                ariaLabel="Select language"
                bg={pill.bg}
                border={pill.border}
                color={pill.color}
                style={{ width: 'auto', minWidth: 36, padding: '0 10px', borderRadius: 999, gap: 5 }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {locale.toUpperCase()}
                </span>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.6 }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconPill>

              {langOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setLangOpen(false)} />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      zIndex: 100,
                      background: isDark ? 'rgba(13,23,40,0.96)' : 'rgba(255,255,255,0.97)',
                      border: `1px solid ${isDark ? 'rgba(163,183,214,0.22)' : 'rgba(100,120,180,0.18)'}`,
                      borderRadius: 16,
                      boxShadow: 'var(--shadow-md)',
                      padding: '6px',
                      minWidth: 180,
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                    }}
                  >
                    {availableLocales.map((loc) => {
                      const active = locale === loc.code;
                      return (
                        <button
                          key={loc.code}
                          onClick={() => { setLocale(loc.code as SupportedLocale); setLangOpen(false); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: 10,
                            border: 'none',
                            background: active ? 'var(--accent-soft)' : 'transparent',
                            color: active ? 'var(--accent)' : 'var(--text-primary)',
                            fontSize: 14,
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-overlay)';
                          }}
                          onMouseLeave={(e) => {
                            if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          <span>{loc.nativeName}</span>
                          <span style={{
                            fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                            letterSpacing: 0.8, color: active ? 'var(--accent)' : 'var(--text-faint)',
                            padding: '2px 6px', borderRadius: 4,
                            background: active ? 'var(--accent-soft)' : 'var(--bg-overlay)',
                          }}>
                            {loc.code.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Theme toggle — cyan accent border */}
            <IconPill
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              ariaLabel={t('toggle' as any) ?? 'Toggle theme'}
              title={isDark ? 'Switch to light' : 'Switch to dark'}
              bg={pill.bg}
              border={pill.border}
              color={pill.color}
              accentBorder={themeBorder}
            >
              {isDark ? (
                /* Sun */
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                /* Moon */
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </IconPill>

            {/* Sign in — pink accent border */}
            <IconPill
              onClick={() => setSignInOpen(true)}
              ariaLabel={t('signIn')}
              bg={pill.bg}
              border={pill.border}
              color={signInColor}
              accentBorder={signInBorder}
              style={{ width: 'auto', minWidth: 36, padding: '0 12px', borderRadius: 999, gap: 6 }}
            >
              {/* Arrow-right into box */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              <span className="signin-label" style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>
                {t('signIn')}
              </span>
            </IconPill>
          </div>
        </nav>
      </header>

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />

      <style>{`
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .signin-label { display: none; }
        }
      `}</style>
    </>
  );
}
