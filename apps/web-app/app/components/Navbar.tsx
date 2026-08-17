'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@hashpass/i18n';
import { useTheme } from './ThemeProvider';
import { SignInModal } from './SignInModal';
import { useSession } from './SessionProvider';
import { UserMenu } from './UserMenu';
import { ClubSettingsMenu } from './ClubSettingsMenu';

// ── Pill / icon-button shared styles ─────────────────────────────────────────
type PillStyle = {
  bg: string;
  border: string;
  color: string;
};

const TOPBAR_CONTROL_SIZE = 40;

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

interface NavbarProps {
  // The #features/#pricing anchors only resolve on the landing page itself,
  // and /documentation/ reads oddly as primary nav once you're inside an
  // authenticated area like /panel -- pages that aren't the marketing
  // landing page pass false here instead of duplicating the whole Navbar.
  showMarketingLinks?: boolean;
  // Only the landing page renders a dark/colorful hero behind the top of
  // the page, which is what the white logo + light link colors below are
  // designed to sit on. Pages without a hero (panel, qr) start directly on
  // the plain theme background, so they must skip the "over hero" styling
  // entirely or the white variant renders washed-out on a light background.
  hasHero?: boolean;
}

export function Navbar({ showMarketingLinks = true, hasHero = true }: NavbarProps) {
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation('nav');
  const [scrolled, setScrolled] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { user, isLoading: sessionLoading } = useSession();
  const isSignedIn = !sessionLoading && !!user;

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

  const overHero = hasHero && !scrolled;
  const isDark   = resolvedTheme === 'dark';

  const pill = pillStyle(overHero, isDark);
  const linkColor      = overHero ? 'rgba(255,255,255,0.80)' : 'var(--text-secondary)';
  const linkHoverColor = overHero ? '#ffffff' : 'var(--text-primary)';

  // Accent border tint for authentication entry.
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
              alt="HASHPASS"
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
          {showMarketingLinks && (
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
          )}

          {/* ── Right controls: mobile-style pill icons ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

            <ClubSettingsMenu
              size={TOPBAR_CONTROL_SIZE}
              triggerStyle={{
                background: pill.bg,
                border: `1.5px solid ${overHero ? 'rgba(0,229,255,0.55)' : isDark ? 'rgba(41,121,255,0.55)' : 'rgba(25,118,210,0.40)'}`,
                color: pill.color,
              }}
            />

            {/* Sign in — pink accent border — or, once a session exists, the
                avatar/profile dropdown in its place. */}
            {isSignedIn ? (
              <UserMenu size={TOPBAR_CONTROL_SIZE} />
            ) : (
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
            )}
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
