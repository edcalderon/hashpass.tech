'use client';

import Link from 'next/link';
import { useTranslation } from '@hashpass/i18n';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useSession } from '../components/SessionProvider';

// Landing spot for "Explorar panel" (UserMenu + SignInModal's post-success
// CTA) -- lives inside hashpass.club itself rather than opening the main
// mobile app, since event creation and QR-link management are being built
// here, not there (pass/access tracking stays on the mobile app, inside
// each event -- see .agents/active/task-panel-web-club-events-qr.md).
// QR link creation/administration is live at /panel/qr; event creation and
// member/roster management are still coming soon.
export default function PanelPage() {
  const { t } = useTranslation('panel');
  const { user, isLoading } = useSession();

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
      <Navbar showMarketingLinks={false} hasHero={false} />
      <main
        style={{
          flex: '1 0 auto',
          maxWidth: 720,
          margin: '0 auto',
          padding: 'clamp(120px, 14vw, 160px) 24px 80px',
        }}
      >
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div
              aria-hidden
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                animation: 'panel-spin 0.8s linear infinite',
              }}
            />
          </div>
        ) : !user ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontSize: 'clamp(22px, 3.5vw, 28px)', fontWeight: 700,
              color: 'var(--text-primary)', margin: '0 0 10px', fontFamily: 'var(--font-display)',
            }}>
              {t('signInRequiredTitle')}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
              {t('signInRequiredBody')}
            </p>
            <Link
              href="/"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 22px', borderRadius: 12,
                background: 'var(--accent)', color: '#ffffff',
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}
            >
              {t('backHome')}
            </Link>
          </div>
        ) : (
          <>
            <p style={{
              fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              color: 'var(--accent)', margin: '0 0 8px', fontFamily: 'var(--font-mono)',
            }}>
              {t('eyebrow')}
            </p>
            <h1 style={{
              fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 700,
              color: 'var(--text-primary)', margin: '0 0 10px', fontFamily: 'var(--font-display)',
              letterSpacing: -0.5,
            }}>
              {t('title')}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 40px', lineHeight: 1.6, maxWidth: 520 }}>
              {t('subtitle', { name: (user.user_metadata?.full_name as string | undefined) || user.email || '' })}
            </p>

            <Link
              href="/panel/qr"
              style={{
                display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none',
                border: '1px solid var(--border-strong)', borderRadius: 20,
                padding: 'clamp(20px, 3vw, 28px)', background: 'var(--bg-surface-raised)',
                marginBottom: 16,
              }}
            >
              <span style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FeatureIcon name="qr" />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('featureQr')}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>
                  {t('featureQrSubtitle')}
                </span>
              </span>
              <span aria-hidden style={{ color: 'var(--accent)', fontSize: 18 }}>→</span>
            </Link>

            <div style={{
              border: '1px solid var(--border-strong)', borderRadius: 20,
              padding: 'clamp(24px, 4vw, 32px)', background: 'var(--bg-surface-raised)',
            }}>
              <h2 style={{
                fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px',
              }}>
                {t('comingSoonTitle')}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 20px', lineHeight: 1.6 }}>
                {t('comingSoonBody')}
              </p>

              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { icon: 'events', label: t('featureEvents') },
                  { icon: 'members', label: t('featureMembers') },
                ].map(({ icon, label }) => (
                  <li key={icon} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      background: 'var(--accent-soft)', color: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FeatureIcon name={icon} />
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </main>

      <Footer />

      <style>{`
        @keyframes panel-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function FeatureIcon({ name }: { name: string }) {
  if (name === 'qr') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <path d="M14 14h3M14 18h3M18 14v7M21 18v3"/>
      </svg>
    );
  }
  if (name === 'members') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  );
}
