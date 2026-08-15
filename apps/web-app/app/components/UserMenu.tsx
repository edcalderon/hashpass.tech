'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@hashpass/i18n';
import { useTheme } from './ThemeProvider';
import { useSession } from './SessionProvider';
import { useToast } from './Toast';
import { supabaseClient } from '../../lib/supabase-client';

// Same fallback service (and same params) apps/mobile-app's own profile
// screen uses (generateUIAvatarUrl in app/(shared)/dashboard/profile.tsx) --
// matches hashpass.tech's actual avatar look instead of a locally-invented
// initials circle, and gives every user a real photo URL to render even
// when Supabase has no avatar_url/picture on file.
function uiAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=200&bold=true&format=png`;
}

function menuItemStyle(color: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '9px 12px', marginTop: 2, borderRadius: 10, border: 'none',
    background: 'transparent', color, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
  };
}

// Replaces the navbar's "Sign in" pill once a Supabase session exists
// (HashPass Auth QR login, or any future auth path this app grows).
export function UserMenu() {
  const { user } = useSession();
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation('nav');
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const isDark = resolvedTheme === 'dark';

  if (!user) return null;

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email ||
    'HASHPASS';
  const realPhotoUrl = (user.user_metadata?.avatar_url || user.user_metadata?.picture) as
    | string
    | undefined;
  // CSS background-image fails silently on a broken/blocked photo URL (no
  // onError to react to) -- a real <img> lets a failed load fall through to
  // the generated avatar instead of rendering an empty circle.
  const avatarSrc = !photoFailed && realPhotoUrl ? realPhotoUrl : uiAvatarUrl(displayName);

  const openPanel = () => {
    setOpen(false);
    router.push('/panel');
  };

  const signOut = async () => {
    setOpen(false);
    const { error } = await supabaseClient().auth.signOut();
    if (error) {
      toast.error(t('signOutError'));
      return;
    }
    toast.success(t('signOutSuccess'));
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('account')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1.5px solid var(--border-strong)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          padding: 0,
          transition: 'opacity 0.15s, transform 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      >
        {/* key forces a remount (and a fresh error state) whenever the
            underlying photo URL actually changes, e.g. a different user. */}
        <img
          key={realPhotoUrl ?? displayName}
          src={avatarSrc}
          alt=""
          onError={() => setPhotoFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 100,
              background: isDark ? 'rgba(13,23,40,0.98)' : 'rgba(255,255,255,0.98)',
              border: '1px solid var(--border-strong)',
              borderRadius: 16,
              boxShadow: 'var(--shadow-md)',
              padding: 6,
              minWidth: 220,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {displayName}
              </p>
              {user.email && displayName !== user.email && (
                <p style={{
                  margin: '2px 0 0', fontSize: 12, color: 'var(--text-faint)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {user.email}
                </p>
              )}
            </div>

            <button
              onClick={openPanel}
              role="menuitem"
              style={menuItemStyle('var(--text-primary)')}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-overlay)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
              {t('exploreDashboard')}
            </button>

            <button
              onClick={signOut}
              role="menuitem"
              style={menuItemStyle('var(--danger)')}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-overlay)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              {t('signOut')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
