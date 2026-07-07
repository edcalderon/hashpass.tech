'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { useTranslation, useLocale, useSetLocale, useAvailableLocales } from '@hashpass/i18n';
import type { SupportedLocale } from '@hashpass/i18n';
import { useTheme } from './ThemeProvider';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

// Encodes a deep-link the HASHPASS mobile app can handle.
// hashpass://auth/connect?source=web will open the app's auth flow.
const QR_VALUE = 'hashpass://auth/connect?source=web&ref=landing';
const APP_STORE_URL = 'https://apps.apple.com/app/hashpass';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.hashpass';
const WEB_APP_URL = 'https://hashpass.club';

export function SignInModal({ open, onClose }: SignInModalProps) {
  const { t } = useTranslation('nav');
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const locale = useLocale();
  const setLocale = useSetLocale();
  const availableLocales = useAvailableLocales();
  const [langOpen, setLangOpen] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const qrFg = isDark ? '#f5f7fb' : '#0d1728';
  const qrBg = isDark ? '#0d1728' : '#ffffff';

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: isDark ? 'rgba(5,8,22,0.78)' : 'rgba(13,23,40,0.48)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'modal-in 0.22s ease both',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('signInWith')}
        style={{
          background: isDark ? 'rgba(13,23,40,0.96)' : 'rgba(255,255,255,0.97)',
          border: `1px solid ${isDark ? 'rgba(41,121,255,0.28)' : 'rgba(21,101,192,0.18)'}`,
          borderRadius: 24,
          boxShadow: isDark ? '0 32px 80px rgba(0,0,0,0.7)' : '0 24px 60px rgba(13,23,40,0.18)',
          paddingTop: 'clamp(56px, 7vw, 68px)',
          paddingBottom: 'clamp(28px, 5vw, 40px)',
          paddingLeft: 'clamp(24px, 5vw, 40px)',
          paddingRight: 'clamp(24px, 5vw, 40px)',
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          animation: 'modal-card-in 0.28s cubic-bezier(0.22,1,0.36,1) both',
          position: 'relative',
        }}
      >
        {/* ── Top bar: controls left, close right ── */}
        <div style={{
          position: 'absolute', top: 14, left: 16, right: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Language + theme pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Language pill */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setLangOpen((v) => !v)}
                aria-label="Select language"
                style={{
                  height: 28, padding: '0 10px', borderRadius: 999,
                  background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${isDark ? 'rgba(163,183,214,0.18)' : 'rgba(100,120,180,0.18)'}`,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  letterSpacing: 0.8, transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'; }}
              >
                {locale.toUpperCase()}
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden style={{ opacity: 0.6 }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {langOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setLangOpen(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 11,
                    background: isDark ? 'rgba(13,23,40,0.98)' : 'rgba(255,255,255,0.98)',
                    border: `1px solid ${isDark ? 'rgba(163,183,214,0.22)' : 'rgba(100,120,180,0.18)'}`,
                    borderRadius: 12, boxShadow: 'var(--shadow-md)',
                    padding: '4px', minWidth: 160,
                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  }}>
                    {availableLocales.map((loc) => {
                      const active = locale === loc.code;
                      return (
                        <button
                          key={loc.code}
                          onClick={() => { setLocale(loc.code as SupportedLocale); setLangOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8,
                            border: 'none',
                            background: active ? 'var(--accent-soft)' : 'transparent',
                            color: active ? 'var(--accent)' : 'var(--text-primary)',
                            fontSize: 13, fontWeight: active ? 600 : 400,
                            cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
                          }}
                          onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-overlay)'; }}
                          onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <span>{loc.nativeName}</span>
                          <span style={{
                            fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                            letterSpacing: 0.8, padding: '2px 5px', borderRadius: 4,
                            color: active ? 'var(--accent)' : 'var(--text-faint)',
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

            {/* Theme toggle pill */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label="Toggle theme"
              title={isDark ? 'Switch to light' : 'Switch to dark'}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${isDark ? 'rgba(41,121,255,0.45)' : 'rgba(25,118,210,0.35)'}`,
                color: isDark ? '#82b1ff' : '#1565c0',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(41,121,255,0.14)' : 'rgba(25,118,210,0.10)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'; }}
            >
              {isDark ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
              border: `1px solid ${isDark ? 'rgba(163,183,214,0.18)' : 'rgba(100,120,180,0.14)'}`,
              cursor: 'pointer', color: 'var(--text-faint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.09)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Logo */}
        <img
          src="/logo-hashpass.svg"
          alt="HASHPASS"
          style={{ width: 48, height: 48, marginBottom: 16 }}
        />

        {/* Title */}
        <h2 style={{
          fontSize: 20, fontWeight: 700, color: 'var(--text-primary)',
          margin: '0 0 6px', fontFamily: 'var(--font-display)',
          textAlign: 'center', letterSpacing: -0.5,
        }}>
          {t('signInWith')}
        </h2>
        <p style={{
          fontSize: 13, color: 'var(--text-secondary)',
          margin: '0 0 28px', textAlign: 'center', lineHeight: 1.5,
        }}>
          {t('scanQr')}
        </p>

        {/* QR frame */}
        <div style={{
          padding: 16,
          borderRadius: 18,
          background: qrBg,
          border: `1.5px solid ${isDark ? 'rgba(41,121,255,0.22)' : 'rgba(21,101,192,0.14)'}`,
          boxShadow: isDark ? '0 0 0 1px rgba(41,121,255,0.10), 0 8px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(13,23,40,0.10)',
          marginBottom: 24,
        }}>
          <QRCode
            value={QR_VALUE}
            size={196}
            fgColor={qrFg}
            bgColor={qrBg}
            style={{ display: 'block', borderRadius: 8 }}
            level="M"
          />
        </div>

        {/* Open app button */}
        <a
          href={QR_VALUE}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '12px 20px',
            borderRadius: 12,
            background: 'var(--accent)',
            color: '#ffffff',
            fontSize: 14, fontWeight: 700, textDecoration: 'none',
            letterSpacing: -0.2,
            transition: 'opacity 0.15s, transform 0.15s',
            marginBottom: 12,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = '0.88';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = '1';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          {/* HASHPASS icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {t('openApp')}
        </a>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginBottom: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {t('orContinue')}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Web link */}
        <a
          href={WEB_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '11px 20px',
            borderRadius: 12,
            border: '1.5px solid var(--border-strong)',
            background: 'var(--bg-overlay)',
            color: 'var(--text-primary)',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
            transition: 'border-color 0.15s, background 0.15s',
            marginBottom: 20,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
            (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-overlay)';
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          hashpass.club
        </a>

        {/* App store links */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ opacity: 0.6, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)', textDecoration: 'none', fontFamily: 'var(--font-mono)', letterSpacing: 0.3 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
          >
            {/* Apple */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            App Store
          </a>
          <span style={{ color: 'var(--border)', fontSize: 11 }}>·</span>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ opacity: 0.6, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)', textDecoration: 'none', fontFamily: 'var(--font-mono)', letterSpacing: 0.3 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
          >
            {/* Android */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 20.5v-17c0-.83.94-1.3 1.6-.8l14 8.5c.6.37.6 1.23 0 1.6l-14 8.5c-.66.5-1.6.03-1.6-.8z"/></svg>
            Google Play
          </a>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modal-card-in {
          from { opacity: 0; transform: scale(0.94) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
