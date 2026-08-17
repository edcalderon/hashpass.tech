'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { HashpassError, type BeginQrLoginResult } from '@hashpass/sdk';
import { useTranslation, useLocale, useSetLocale, useAvailableLocales } from '@hashpass/i18n';
import type { SupportedLocale } from '@hashpass/i18n';
import { hashpassSdk } from '../../lib/hashpass-sdk';
import { supabaseClient } from '../../lib/supabase-client';
import { resolveHashpassAppUrl } from '../../lib/hashpass-app-url';
import { useTheme } from './ThemeProvider';
import { useToast } from './Toast';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

// HashPass Auth: passwordless login via QR code, approved by the HashPass
// mobile app under the user's own session. See
// packages/hashpass-links-api/README.md for the service this talks to.
type QrAuthPhase = 'connecting' | 'waiting' | 'denied' | 'expired' | 'success' | 'error';

// Encodes a deep-link the HASHPASS mobile app can handle.
// hashpass://auth/connect?source=web will open the app's auth flow.
// There's no Universal Links / App Links setup for hashpass.tech yet (no
// apple-app-site-association or assetlinks.json), so this relies on the
// custom URI scheme + a visibility-based fallback timer rather than a real
// https universal link.
const QR_VALUE = 'hashpass://auth/connect?source=web&ref=landing';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.hashpass.tech&hl=en-US&ah=RlHQxhHQladajDZn9ZGTm7_ucMs';
const APP_OPEN_FALLBACK_MS = 1400;

// Branded-QR sizing, matching app/qr/page.tsx's showcase ratios (icon 20%
// of the code, badge 1.32x the icon) so both codes read as the same
// HASHPASS Club visual system even though this one is a different size.
const QR_BRAND_ICON_SRC = '/icon-512.png';
const QR_LOGIN_SIZE = 196;
const QR_ICON_SIZE = QR_LOGIN_SIZE * 0.2;
const QR_BADGE_SIZE = QR_ICON_SIZE * 1.32;

// Opens the main HASHPASS web app's /auth/connect screen in a new tab -- if
// that browser already has an authenticated session, the app approves this
// exact challenge directly (see apps/mobile-app/app/auth/connect), no phone
// needed. `challengeId` is the same public id embedded in the QR code's own
// URL, not the PKCE verifier or binding secret, so it's safe to pass in a
// plain query string.
//
// This used to be folded into a single platform-detected button
// (openHashpassApp) that guessed whether to open the web flow or the native
// app based on the visiting device's user agent. Split into two explicit,
// separately-labeled buttons instead: a platform guess is still just a
// guess (desktop Chrome with Android devtools, an in-app browser reporting
// a desktop UA, etc.), and the "missing information" error on
// hashpass.tech/auth/connect is exactly what happens when this path fires
// without a real challengeId in flight -- letting the visitor pick
// explicitly removes that whole class of guess-wrong failure.
function openWebApp(challengeId?: string, locale?: string) {
  const appUrl = resolveHashpassAppUrl();
  const connectParams = new URLSearchParams({ source: 'web', ref: 'landing' });
  if (challengeId) connectParams.set('challengeId', challengeId);
  if (locale) connectParams.set('locale', locale);
  window.open(`${appUrl}/auth/connect?${connectParams.toString()}`, '_blank', 'noopener,noreferrer');
}

// Tries the native Android app via its custom URI scheme, falling back to
// the Play Store listing if the app isn't installed (page stays visible
// past the fallback window -- if the app opened, the tab backgrounds and
// this never fires). No iOS listing yet, so this button is Android-specific
// by design rather than a generic "mobile app" button.
function openAndroidApp() {
  const storeUrl = PLAY_STORE_URL;
  let fellBack = false;

  const cancelFallback = () => {
    fellBack = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  const onVisibilityChange = () => {
    if (document.hidden) cancelFallback();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.location.href = QR_VALUE;

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (!fellBack && !document.hidden) {
      window.location.href = storeUrl;
    }
  }, APP_OPEN_FALLBACK_MS);
}

export function SignInModal({ open, onClose }: SignInModalProps) {
  const { t } = useTranslation('nav');
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const locale = useLocale();
  const setLocale = useSetLocale();
  const availableLocales = useAvailableLocales();
  const [langOpen, setLangOpen] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const [qrPhase, setQrPhase] = useState<QrAuthPhase>('connecting');
  const [qrLogin, setQrLogin] = useState<BeginQrLoginResult | null>(null);
  const qrAbortRef = useRef<AbortController | null>(null);

  // startQrLogin below is intentionally a stable useCallback([]) -- the
  // effect that auto-starts it on modal open depends on it, and a
  // reference that changes every render would restart the whole flow on
  // every render while the modal is open. t/toast aren't stable across
  // renders (translations re-render on locale change, toast's context
  // value is a fresh object per ToastProvider render), so they're read via
  // refs instead of being closed over directly.
  const latestRef = useRef({ t, toast });
  latestRef.current = { t, toast };

  const startQrLogin = useCallback(() => {
    qrAbortRef.current?.abort();
    const controller = new AbortController();
    qrAbortRef.current = controller;
    setQrPhase('connecting');
    setQrLogin(null);

    (async () => {
      try {
        const result = await hashpassSdk().authQr.beginLogin();
        if (controller.signal.aborted) return;
        setQrLogin(result);
        setQrPhase('waiting');

        const session = await hashpassSdk().authQr.waitForLogin(result, { signal: controller.signal });
        if (controller.signal.aborted) return;
        // setSession() reports an invalid/mismatched/expired token through
        // its returned `error`, not necessarily by rejecting the promise --
        // ignoring it would show "success" while no usable session was
        // actually installed.
        const { error: setSessionError } = await supabaseClient().auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        if (controller.signal.aborted) return;
        if (setSessionError) {
          console.error('[HashPass Auth] setSession failed:', setSessionError);
          latestRef.current.toast.error(latestRef.current.t('qrError'));
          setQrPhase('error');
          return;
        }
        latestRef.current.toast.success(latestRef.current.t('qrSuccess'));
        setQrPhase('success');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof HashpassError && error.code === 'unauthorized') {
          latestRef.current.toast.info(latestRef.current.t('qrDenied'));
          setQrPhase('denied');
        } else if (error instanceof HashpassError && error.code === 'timeout') {
          latestRef.current.toast.info(latestRef.current.t('qrExpired'));
          setQrPhase('expired');
        } else {
          // Anything landing here is unexpected (not a normal deny/expiry) --
          // log it so a real failure is diagnosable from the console instead
          // of just a generic "Something went wrong" with no trace of why.
          console.error('[HashPass Auth] QR login failed:', error);
          latestRef.current.toast.error(latestRef.current.t('qrError'));
          setQrPhase('error');
        }
      }
    })();
  }, []);

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

  // Start a fresh challenge every time the modal opens, and stop polling the
  // moment it closes -- waitForLogin() otherwise keeps polling in the
  // background indefinitely.
  useEffect(() => {
    if (!open) {
      qrAbortRef.current?.abort();
      return;
    }
    startQrLogin();
    return () => qrAbortRef.current?.abort();
  }, [open, startQrLogin]);

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
          width: QR_LOGIN_SIZE,
          height: QR_LOGIN_SIZE,
          padding: 16,
          borderRadius: 18,
          background: qrBg,
          border: `1.5px solid ${isDark ? 'rgba(41,121,255,0.22)' : 'rgba(21,101,192,0.14)'}`,
          boxShadow: isDark ? '0 0 0 1px rgba(41,121,255,0.10), 0 8px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(13,23,40,0.10)',
          marginBottom: 12,
          boxSizing: 'content-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {qrPhase === 'waiting' && qrLogin ? (
            // Same branded-QR treatment as the /qr showcase (app/qr/page.tsx):
            // a centered HASHPASS mark badge over a high-error-correction
            // code, so both codes carry consistent HASHPASS Club branding
            // instead of this one being a plain, unbranded code.
            <div style={{ position: 'relative' }}>
              <QRCode
                value={qrLogin.challenge.qrUrl}
                size={QR_LOGIN_SIZE}
                fgColor={qrFg}
                bgColor={qrBg}
                style={{ display: 'block', borderRadius: 8 }}
                level="H"
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: QR_BADGE_SIZE, height: QR_BADGE_SIZE, borderRadius: '50%', background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static export, no next/image loader available */}
                <img src={QR_BRAND_ICON_SRC} alt="" width={QR_ICON_SIZE} height={QR_ICON_SIZE} style={{ display: 'block' }} />
              </div>
            </div>
          ) : (
            <div style={{
              width: QR_LOGIN_SIZE, height: QR_LOGIN_SIZE,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, textAlign: 'center', padding: 12,
            }}>
              {(qrPhase === 'connecting' || qrPhase === 'success') && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden style={{
                  color: 'var(--accent)',
                  animation: qrPhase === 'connecting' ? 'qr-spin 0.9s linear infinite' : undefined,
                }}>
                  {qrPhase === 'success' ? (
                    <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  ) : (
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                  )}
                </svg>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {qrPhase === 'connecting' && t('qrConnecting')}
                {qrPhase === 'success' && t('qrSuccess')}
                {qrPhase === 'denied' && t('qrDenied')}
                {qrPhase === 'expired' && t('qrExpired')}
                {qrPhase === 'error' && t('qrError')}
              </span>
              {(qrPhase === 'denied' || qrPhase === 'expired' || qrPhase === 'error') && (
                <button
                  onClick={startQrLogin}
                  style={{
                    marginTop: 4, padding: '6px 14px', borderRadius: 999,
                    border: '1px solid var(--accent)', background: 'transparent',
                    color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {t('qrRetry')}
                </button>
              )}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          margin: '0 0 24px', minHeight: 16,
        }}>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>
            {qrPhase === 'waiting' ? t('qrWaiting') : ' '}
          </p>
          {qrPhase === 'waiting' && (
            <button
              onClick={startQrLogin}
              aria-label={t('qrRefresh')}
              title={t('qrRefresh')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, padding: 0, borderRadius: '50%',
                border: 'none', background: 'transparent', color: 'var(--text-faint)',
                cursor: 'pointer', transition: 'color 0.15s, transform 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'; }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'rotate(-90deg)'; }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'rotate(0deg)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M20 11A8 8 0 0 0 6.34 6.34M4 13a8 8 0 0 0 13.66 4.66M4 4v5h5M20 20v-5h-5"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        {qrPhase === 'success' ? (
          /* Signed in -- the connect flow's job is done, so this button
             stops being about reaching the app at all and starts being
             about actually using it. Navigates inside hashpass.club itself
             (the club commander center -- QR-link creation, member/pass
             management) rather than opening the mobile app's dashboard. */
          <Link
            href="/panel"
            onClick={() => onClose()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '12px 20px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#ffffff',
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
              letterSpacing: -0.2,
              transition: 'opacity 0.15s, transform 0.15s',
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            {t('exploreDashboard')}
          </Link>
        ) : (
          <>
            {/* Sign in using web app -- always opens hashpass.tech/auth/connect
                in a new tab, regardless of device. This is the reliable
                universal path (works on any device with a browser), so it's
                the primary button. */}
            <a
              href={QR_VALUE}
              onClick={(e) => {
                e.preventDefault();
                openWebApp(qrLogin?.challenge.id, locale);
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '12px 20px',
                borderRadius: 12,
                background: 'var(--accent)',
                color: '#ffffff',
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
                letterSpacing: -0.2,
                transition: 'opacity 0.15s, transform 0.15s',
                marginBottom: 10,
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
              {/* Browser / web icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9"/>
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>
              </svg>
              {t('signInWebApp')}
            </a>

            {/* Open the Android app -- explicit, separate from the web
                button above (no platform guessing). Tries the native app's
                deep link first, falls back to the Play Store listing if the
                app isn't installed. No iOS listing yet, so this is
                Android-specific by design rather than a generic "mobile
                app" button. */}
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                openAndroidApp();
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '11px 20px',
                borderRadius: 12,
                background: 'transparent',
                border: '1.5px solid #3DDC84',
                color: isDark ? '#3DDC84' : '#0F9D58',
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
                letterSpacing: -0.2,
                transition: 'opacity 0.15s, transform 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(61,220,132,0.10)' : 'rgba(15,157,88,0.06)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {/* Android robot */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 20.5v-17c0-.83.94-1.3 1.6-.8l14 8.5c.6.37.6 1.23 0 1.6l-14 8.5c-.66.5-1.6.03-1.6-.8z"/>
              </svg>
              {t('openAndroidApp')}
            </a>
          </>
        )}
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
