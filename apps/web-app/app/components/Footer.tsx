'use client';

import { useState } from 'react';
import { useTranslation } from '@hashpass/i18n';
import { uiTokens } from '@hashpass/ui/tokens';
import { CURRENT_VERSION, getClubVersionLabel } from '../../config/version';
import { scrollToAnchor } from '../../lib/scroll-to-anchor';
import { PricingDialog } from './PricingDialog';
import { useTheme } from './ThemeProvider';

export function Footer() {
  const { t } = useTranslation('footer');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [pricingOpen, setPricingOpen] = useState(false);
  const year = new Date().getFullYear();
  const versionLabel = getClubVersionLabel(CURRENT_VERSION);
  const versionTooltip = `Build ${CURRENT_VERSION.buildNumber} · Released ${CURRENT_VERSION.releaseDate}`;

  const sections = [
    {
      title: t('product'),
      links: [
        {
          label: t('features'),
          href: '#features',
          children: [
            { label: t('qrLinks'), href: '/qr' },
            { label: t('attending'), href: '/attendings/' },
          ],
        },
        { label: t('pricing'), href: '#pricing', children: [] },
        { label: t('docs'), href: '/documentation/', children: [] },
        { label: t('status'), href: 'https://hashpass.tech/status', children: [] },
      ],
    },
    {
      title: t('company'),
      links: [
        { label: t('about'), href: '/about/', children: [] },
        { label: t('blog'), href: '#', children: [] },
      ],
    },
    {
      title: t('legal'),
      links: [
        { label: t('privacy'), href: '/documentation/legal/privacy-policy/', children: [] },
        { label: t('terms'), href: '/documentation/legal/terms-of-service/', children: [] },
        { label: t('deleteAccount'), href: 'https://hashpass.tech/delete-account', children: [] },
      ],
    },
  ];

  return (
    <footer
      id="features"
      style={{
        flexShrink: 0,
        background: 'var(--bg-canvas)',
        borderTop: '1px solid var(--border)',
        padding: 'clamp(40px, 6vw, 64px) 20px 24px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* ── Top section: brand + tagline (mobile-first column) ────────────────── */}
        <div
          style={{
            marginBottom: 'clamp(32px, 5vw, 48px)',
            paddingBottom: 'clamp(24px, 4vw, 32px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginBottom: 12 }}>
            <img
              src={isDark
                ? '/logo-full-hashpass-white-cyan.svg'
                : '/logo-full-hashpass-black-cyan.svg'}
              alt="HASHPASS"
              style={{
                display: 'block',
                width: 'clamp(70px, 10vw, 120px)',
                height: 'auto',
                flexShrink: 0,
                filter: isDark ? 'hue-rotate(320deg) saturate(1.2)' : 'none',
                transition: 'filter 0.3s',
              }}
            />
            <span
              style={{
                fontSize: 'clamp(9px, 1.3vw, 11px)',
                fontWeight: 600,
                color: 'var(--text-faint)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: 0.3,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              .club
            </span>
          </div>
          <p
            style={{
              fontSize: 'clamp(13px, 2vw, 14px)',
              lineHeight: 1.6,
              color: 'var(--text-faint)',
              margin: 0,
              maxWidth: 280,
            }}
          >
            {t('tagline')}
          </p>
        </div>

        {/* ── Nav grid: responsive columns ──────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'clamp(24px, 4vw, 40px)',
            marginBottom: 'clamp(24px, 4vw, 32px)',
          }}
        >
          {sections.map((section) => (
            <div key={section.title}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: 'var(--text-faint)',
                  margin: '0 0 12px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {section.title}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.href === '#pricing' ? (
                      <button
                        type="button"
                        onClick={() => setPricingOpen(true)}
                        style={{
                          appearance: 'none',
                          background: 'none',
                          border: 0,
                          padding: 0,
                          font: 'inherit',
                          fontSize: 'clamp(13px, 1.5vw, 14px)',
                          color: 'var(--text-secondary)',
                          transition: 'color 0.2s',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                      >
                        {link.label}
                      </button>
                    ) : (
                      <a
                        href={link.href}
                        onClick={link.href === '#features' ? (event) => {
                          event.preventDefault();
                          scrollToAnchor('features');
                        } : undefined}
                        {...(link.href.startsWith('http')
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                        style={{
                          fontSize: 'clamp(13px, 1.5vw, 14px)',
                          color: 'var(--text-secondary)',
                          transition: 'color 0.2s',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                      >
                        {link.label}
                      </a>
                    )}
                    {link.children.length > 0 && (
                      <ul
                        style={{
                          margin: `${uiTokens.space.xs}px 0 0 ${uiTokens.space.xs}px`,
                          padding: `0 0 0 ${uiTokens.space.md}px`,
                          listStyle: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: uiTokens.space.sm,
                          borderLeft: `${uiTokens.control.borderWidth}px solid var(--border)`,
                        }}
                      >
                        {link.children.map((child) => (
                          <li key={child.label}>
                            <a
                              href={child.href}
                              {...(child.href.startsWith('http')
                                ? { target: '_blank', rel: 'noopener noreferrer' }
                                : {})}
                              style={{
                                fontSize: 'clamp(13px, 1.5vw, 14px)',
                                color: 'var(--text-secondary)',
                                transition: 'color 0.2s',
                                textDecoration: 'none',
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                            >
                              {child.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Bottom bar: copyright only, minimal and clean ──────────────────────── */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 'clamp(16px, 3vw, 24px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 'clamp(11px, 1.3vw, 12px)', color: 'var(--text-faint)' }}>
            {t('copyright', { year })}
          </span>
          <span
            title={versionTooltip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--bg-overlay)',
              color: 'var(--text-secondary)',
              fontSize: 'clamp(11px, 1.25vw, 12px)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}
          >
            {versionLabel}
          </span>
        </div>
      </div>
      <PricingDialog open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </footer>
  );
}
