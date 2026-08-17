'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { useTranslation } from '@hashpass/i18n';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ScrollToTop } from '../components/ScrollToTop';
import { ShaderBackground } from '../components/ShaderBackground';
import { LandingAnimationProvider, useLandingAnimationMode } from '../components/LandingAnimationProvider';
import { useTheme } from '../components/ThemeProvider';
import { useToast } from '../components/Toast';
import { downloadQrPng } from '../../lib/qr-image';
import { destinationInputFromUrl, toHttpsDestination } from '../../lib/qr-link-editor';
import { hashpassSdk } from '../../lib/hashpass-sdk';
// Direct subpath import, not the package's main barrel (@hashpass/ui) --
// see the identical note in apps/web-app/app/panel/qr/page.tsx.
import { CaptchaWidget } from '@hashpass/ui/CaptchaWidget';

// Public marketing showcase for the HashPass Links / QR system
// (packages/hashpass-links-api, fronted by hpass.id/hashpass.link/hashp.link
// -- see that package's README "Multi-domain cutover"). Lives at
// hashpass.club/qr rather than a new subdomain or on hpass.id itself --
// hpass.id is a purely transactional redirect + auth-qr API (Lambda +
// API Gateway, no HTML rendering), so this storefront stays on the existing
// static apps/web-app export. See .agents/active/task-panel-web-club-events-qr.md.
const LINKS_ORIGIN = (process.env.NEXT_PUBLIC_LINKS_API_BASE_URL || '').replace(/\/$/, '');
const CAPTCHA_API_ENDPOINT = `${LINKS_ORIGIN}/api/captcha`;
// The free tier always lives on the shared hpass.id domain (the primary
// short-link/QR domain) -- a custom subdomain (your-club.hashpass.link,
// under the cosmetic/branding domain) is an account-holder feature, see the
// EngineSection's "coming soon" card below. Anonymous visitors can only
// edit the slug, never this prefix.
const FREE_LINK_PREFIX = 'hpass.id/q/';
// Rotates through the Destination field's empty-state placeholder -- real
// domain shapes (with a TLD), since that field is validated as an actual
// public domain via toHttpsDestination, not a free-text slug fragment.
const PLACEHOLDER_DESTINATION_WORDS = ['my-concert.com', 'my-event.site', 'my-flyer.xyz', 'my-club.io', 'my-tour.co'] as const;
const PLACEHOLDER_ROTATE_MS = 2200;
// What the preview QR encodes before a real one has been generated -- a
// real, working link, not a dead decorative icon, so scanning it before
// generating never dead-ends.
const DEFAULT_PREVIEW_VALUE = 'https://hashpass.club';
const BRAND_ICON_SRC = '/icon-512.png';
const QR_PREVIEW_SIZE = 176;

const FEATURE_ACCENTS = ['#8b5cf6', '#d6a55c', '#56d49f', '#86b6ff', '#ec4899', '#f59e0b'] as const;
const FEATURE_ICONS = ['🔗', '⏯', '📈', '🎨', '🏷️', '⚡'] as const;
const FEATURE_KEYS = ['Dynamic', 'Lifecycle', 'Analytics', 'Branding', 'Campaigns', 'Redirect'] as const;
const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;

export default function QrShowcasePage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
      <LandingAnimationProvider>
        <Navbar showMarketingLinks={false} hasHero={false} />
        <main style={{ flex: '1 0 auto' }}>
          <QrHero />
        </main>
      </LandingAnimationProvider>
      <StepsSection />
      <FeaturesSection />
      <EngineSection />
      <FinalCtaSection />
      <Footer />
      <ScrollToTop />
    </div>
  );
}

function QrHero() {
  const { t } = useTranslation('qrShowcase');
  const { animationMode } = useLandingAnimationMode();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Matches HeroSection.tsx's own isDark ternaries -- text sitting directly
  // on the shader needs to flip for contrast, same as the homepage hero.
  const headlineColor = isDark ? '#ffffff' : '#0d1728';
  const subtitleColor = isDark ? 'rgba(245,247,251,0.78)' : 'rgba(13,23,40,0.72)';
  const badgeBorder = isDark ? 'rgba(41,121,255,0.45)' : 'rgba(25,118,210,0.35)';
  const badgeBg = isDark ? 'rgba(41,121,255,0.14)' : 'rgba(25,118,210,0.10)';
  const badgeDot = isDark ? '#2979ff' : '#1976d2';
  const badgeText = isDark ? '#90caf9' : '#1565c0';
  const scrollColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(13,23,40,0.38)';

  const scrollToSteps = () => {
    document.getElementById('qr-how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <ShaderBackground animationMode={animationMode}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '128px 24px 72px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 3,
          isolation: 'isolate',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${badgeBorder}`,
            background: badgeBg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            marginBottom: 28,
            animation: 'qr-fade-up 0.5s ease both',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: badgeDot, display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: badgeText, letterSpacing: 0.3, fontFamily: 'var(--font-mono)' }}>
            {t('badge')}
          </span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(38px, 6.5vw, 74px)',
            fontWeight: 700,
            letterSpacing: -1.6,
            lineHeight: 1.06,
            fontFamily: 'var(--font-display)',
            color: headlineColor,
            margin: '0 0 20px',
            whiteSpace: 'pre-line',
            maxWidth: 720,
            animation: 'qr-fade-up 0.5s 0.08s ease both',
          }}
        >
          {t('title')}
        </h1>

        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 19px)',
            lineHeight: 1.65,
            color: subtitleColor,
            maxWidth: 560,
            margin: '0 0 48px',
            animation: 'qr-fade-up 0.5s 0.16s ease both',
          }}
        >
          {t('subtitle')}
        </p>

        <QrPlayground />

        <button
          onClick={scrollToSteps}
          aria-label={t('scrollCue')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            marginTop: 48,
            color: scrollColor,
            animation: 'qr-fade-in 1s 0.7s ease both',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {t('scrollCue')}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes qr-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes qr-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes qr-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.7); }
        }
      `}</style>
    </ShaderBackground>
  );
}

function sanitizeSlugInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
}

// A public, anonymous, un-moderated pair of fields that render under the
// HASHPASS mark -- worth a lightweight denylist even though this preview
// never reaches a server. Deliberately a plain substring check, not an
// attempt at exhaustive profanity detection (a losing game against spelling
// variants); it only needs to catch the obvious, brand-unsafe case.
const UNSAFE_TERMS = [
  'porn', 'sex', 'xxx', 'nude', 'nsfw', 'fuck', 'slut', 'whore', 'anal', 'cum', 'dick', 'pussy', 'boobs', 'rape',
  'cocaine', 'heroin', 'meth', 'weed', 'marijuana', 'lsd', 'ecstasy', 'mdma', 'fentanyl', 'crack', 'drugs',
] as const;

// Matches the real backend's own behavior for a blank custom slug (see
// createQrLink in packages/hashpass-links-api/src/routes/qr-links.ts: a
// random opaque token, not anything derived from the destination) -- not
// domain-derived, so two links to the same destination don't collide.
function generateRandomSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let result = '';
  for (let i = 0; i < bytes.length; i++) result += chars[bytes[i] % chars.length];
  return result;
}

/** Returns an i18n key describing the problem, or null if it's fine to generate. */
function validateForGenerate(destinationInput: string, slugInput: string): string | null {
  const trimmed = destinationInput.trim();
  if (!trimmed) return 'playgroundDestinationRequired';

  let normalized: string;
  try {
    // Same validator the real /panel/qr create form uses -- requires an
    // actual public domain (a dot, valid label lengths/charset), not just
    // any typed string. See lib/qr-link-editor.ts.
    normalized = toHttpsDestination(trimmed);
  } catch {
    return 'playgroundDestinationInvalid';
  }
  if (UNSAFE_TERMS.some((term) => normalized.toLowerCase().includes(term))) return 'playgroundSlugUnsafe';

  // A blank slug becomes a random, system-generated one (see
  // generateRandomSlug) -- only a slug the visitor actually typed needs
  // length/safety checks here.
  const typedSlug = sanitizeSlugInput(slugInput);
  if (typedSlug) {
    if (typedSlug.length < 3) return 'playgroundSlugTooShort';
    if (UNSAFE_TERMS.some((term) => typedSlug.includes(term))) return 'playgroundSlugUnsafe';
  }
  return null;
}

type PlaygroundPhase = 'idle' | 'verifying' | 'generated';

function QrPlayground() {
  const { t } = useTranslation('qrShowcase');
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const destinationInputRef = useRef<HTMLInputElement | null>(null);

  const [destinationInput, setDestinationInput] = useState('');
  const [destinationTouchedInvalid, setDestinationTouchedInvalid] = useState(false);
  const [slugInput, setSlugInput] = useState('');
  const [slugAvailability, setSlugAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  // The slug actually being generated for -- resolved once at Generate-click
  // time (typed value, or a fresh random one if left blank) and held fixed
  // through verifying, since a random slug must not change on every render.
  const [generatedSlug, setGeneratedSlug] = useState('');
  // The normalized destination generation was actually verified against --
  // resolved once at Generate-click time, same reasoning as generatedSlug.
  // See qrValue below for why this (not a fake hpass.id/q/ address) is
  // what the QR actually encodes.
  const [generatedDestination, setGeneratedDestination] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [foreground, setForeground] = useState('#071426');
  const [background, setBackground] = useState('#ffffff');
  const [downloading, setDownloading] = useState(false);
  const [phase, setPhase] = useState<PlaygroundPhase>('idle');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % PLACEHOLDER_DESTINATION_WORDS.length);
    }, PLACEHOLDER_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  // Real check against GET /api/v1/qr-links/slug-availability, deliberately
  // public (see that route's own comment) so this anonymous page can call
  // it too, same debounced pattern as /panel/qr's real create form.
  useEffect(() => {
    const slug = sanitizeSlugInput(slugInput);
    if (!slug) {
      setSlugAvailability('idle');
      return;
    }
    setSlugAvailability('checking');
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await hashpassSdk().qrLinks.slugAvailability(slug);
        if (!cancelled) setSlugAvailability(result.available ? 'available' : 'taken');
      } catch {
        if (!cancelled) setSlugAvailability('idle');
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [slugInput]);

  // Anonymous/unregistered previews always carry the HASHPASS mark -- it
  // can't be turned off here, only from a real signed-in account (that's
  // the whole point of the free showcase: an unbranded or custom-logo code
  // is an account-holder feature, not something anyone can generate
  // anonymously). Not a real state value on purpose.
  const brandIcon = true;

  // FIXED 2026-08-15: this used to encode a fake `hpass.id/q/{slug}`
  // address that was never actually created server-side (createQrLink
  // requires an authenticated session, which this anonymous public page
  // deliberately never has -- see the captcha block below), so every scan
  // hit a real 404. The Short Link field above still *previews* the
  // hpass.id/q/ shape a signed-in member's real link would get, but
  // the QR itself must only ever encode something that actually resolves
  // -- the verified destination -- so a downloaded/shared/scanned code from
  // this anonymous demo is never dead.
  const qrValue = phase === 'generated' && generatedDestination ? generatedDestination : DEFAULT_PREVIEW_VALUE;
  const effectiveLevel = brandIcon ? 'H' : 'Q';
  const iconSize = QR_PREVIEW_SIZE * 0.2;
  const badgeSize = iconSize * 1.32;

  // Editing anything after a code was generated invalidates it -- the real
  // QR only ever renders for exactly the input that was actually verified,
  // and re-generating (not just downloading/sharing again) is the thing the
  // captcha gates. Cheap no-op when already idle.
  function invalidateGeneration() {
    if (phase === 'idle') return;
    setPhase('idle');
    setCaptchaResetKey((key) => key + 1);
  }

  function updateDestination(value: string) {
    setDestinationInput(destinationInputFromUrl(value));
    setDestinationTouchedInvalid(false);
    invalidateGeneration();
  }

  function updateSlug(value: string) {
    setSlugInput(sanitizeSlugInput(value));
    invalidateGeneration();
  }

  function updateForeground(value: string) {
    setForeground(value);
    invalidateGeneration();
  }

  function updateBackground(value: string) {
    setBackground(value);
    invalidateGeneration();
  }

  async function handleDownload() {
    if (!svgRef.current || phase !== 'generated') return;
    setDownloading(true);
    try {
      await downloadQrPng(svgRef.current, {
        fileName: 'hashpass-qr-preview.png',
        brandIconSrc: brandIcon ? BRAND_ICON_SRC : undefined,
        marginModules: 4,
        backgroundColor: background,
      });
    } catch {
      toast.error(t('downloadError'));
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(qrValue);
      toast.success(t('playgroundToastCopied'));
    } catch {
      toast.error(t('playgroundErrorGeneric'));
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HASHPASS QR', url: qrValue });
      } catch (error) {
        // A user cancelling the native share sheet isn't a real failure.
        if (error instanceof Error && error.name !== 'AbortError') toast.error(t('playgroundErrorGeneric'));
      }
      return;
    }
    await handleCopyLink();
  }

  function handleReset() {
    setDestinationInput('');
    setDestinationTouchedInvalid(false);
    setSlugInput('');
    setGeneratedSlug('');
    setGeneratedDestination('');
    setForeground('#071426');
    setBackground('#ffffff');
    setPhase('idle');
    setCaptchaResetKey((key) => key + 1);
  }

  function handleGenerateClick() {
    const problem = validateForGenerate(destinationInput, slugInput);
    if (problem) {
      toast.error(t(problem));
      setDestinationTouchedInvalid(true);
      destinationInputRef.current?.focus();
      return;
    }
    if (slugAvailability === 'taken') {
      toast.error(t('playgroundSlugTaken'));
      return;
    }
    setDestinationTouchedInvalid(false);
    // Resolved once here, not derived reactively -- a random slug must stay
    // fixed through the captcha step instead of changing on every render.
    setGeneratedSlug(sanitizeSlugInput(slugInput) || generateRandomSlug());
    setGeneratedDestination(toHttpsDestination(destinationInput.trim()));
    setPhase('verifying');
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 760,
        borderRadius: 28,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(9,16,34,0.62)',
        backdropFilter: 'blur(22px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
        boxShadow: '0 30px 90px rgba(2,6,20,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: 'clamp(20px, 3.4vw, 32px)',
        textAlign: 'left',
        animation: 'qr-fade-up 0.5s 0.24s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span
          aria-hidden
          style={{ width: 7, height: 7, borderRadius: '50%', background: '#56d49f', display: 'inline-block', animation: 'qr-pulse-dot 1.8s ease-in-out infinite' }}
        />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#7de3b6', fontFamily: 'var(--font-mono)' }}>
          {t('playgroundLiveLabel')}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          {t('playgroundEyebrow')}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 'clamp(20px, 3vw, 32px)',
          alignItems: 'center',
        }}
        className="qr-playground-grid"
      >
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
            {t('playgroundTitle')}
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.56)', margin: '0 0 16px', maxWidth: 400 }}>
            {t('playgroundHint')}
          </p>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('playgroundSlugLabel')}
            </span>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 0, padding: '0 4px 0 12px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(5,10,24,0.55)',
              }}
            >
              {/* The domain is fixed for the free tier -- clicking it never
                  edits it, only explains why (custom subdomains are an
                  account-holder feature, see EngineSection above and the
                  membership note below). */}
              <button
                type="button"
                title={t('playgroundDomainLockedHint')}
                onClick={() => toast.error(t('playgroundDomainLockedHint'))}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'rgba(255,255,255,0.44)', fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
                }}
              >
                https://{FREE_LINK_PREFIX}
              </button>
              {/* Optional -- same as the real create form's slug field: leave
                  it blank and one is auto-generated from the destination.
                  Once generated, this locks to the actual resolved slug
                  (whatever was typed, or the auto-generated one) instead of
                  still showing the empty editable field -- editing it again
                  means starting a new generation via the Destination field
                  or "Start over". */}
              <input
                value={phase === 'generated' ? generatedSlug : slugInput}
                onChange={(event) => updateSlug(event.target.value)}
                readOnly={phase === 'generated'}
                placeholder={t('playgroundSlugPlaceholder')}
                aria-label={t('playgroundSlugLabel')}
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={32}
                style={{
                  flex: 1, minWidth: 0, padding: '10px 0 10px 2px', border: 'none', outline: 'none',
                  background: 'transparent', color: '#ffffff', fontSize: 14, fontFamily: 'var(--font-mono)',
                  cursor: phase === 'generated' ? 'default' : 'text',
                }}
              />
              {phase === 'generated' && (
                <button
                  type="button"
                  onClick={handleCopyLink}
                  title={t('playgroundCopyLink')}
                  aria-label={t('playgroundCopyLink')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    width: 28, height: 28, marginLeft: 4, borderRadius: 7, border: 'none',
                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              )}
            </div>
          </label>
          {phase !== 'generated' && slugAvailability !== 'idle' && (
            <p
              style={{
                margin: '-10px 0 8px', fontSize: 11.5, fontWeight: 700,
                color: slugAvailability === 'taken' ? '#ea7a7a' : slugAvailability === 'available' ? '#7de3b6' : 'rgba(255,255,255,0.4)',
              }}
            >
              {slugAvailability === 'checking'
                ? t('playgroundSlugChecking')
                : slugAvailability === 'available'
                  ? t('playgroundSlugAvailable')
                  : t('playgroundSlugTaken')}
            </p>
          )}
          {phase !== 'generated' && (
            <p style={{ margin: '-10px 0 14px', fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.4)' }}>
              {t('playgroundSlugAutoHint')}
            </p>
          )}

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('playgroundDestinationLabel')}
            </span>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 0, padding: '0 12px', borderRadius: 10,
                border: `1px solid ${destinationTouchedInvalid ? 'rgba(234,122,122,0.7)' : 'rgba(255,255,255,0.16)'}`,
                background: 'rgba(5,10,24,0.55)', transition: 'border-color 0.15s',
              }}
            >
              <span aria-hidden style={{ color: 'rgba(255,255,255,0.44)', fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'nowrap' }}>
                https://
              </span>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                {!destinationInput && (
                  <span
                    key={placeholderIndex}
                    aria-hidden
                    style={{
                      position: 'absolute', top: '50%', left: 2, transform: 'translateY(-50%)',
                      color: 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-mono)', fontSize: 14,
                      pointerEvents: 'none', whiteSpace: 'nowrap', animation: 'qr-placeholder-fade 2.2s ease',
                    }}
                  >
                    {PLACEHOLDER_DESTINATION_WORDS[placeholderIndex]}
                  </span>
                )}
                <input
                  ref={destinationInputRef}
                  value={destinationInput}
                  onChange={(event) => updateDestination(event.target.value)}
                  aria-label={t('playgroundDestinationLabel')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="url"
                  style={{
                    width: '100%', padding: '10px 0 10px 2px', border: 'none', outline: 'none',
                    background: 'transparent', color: '#ffffff', fontSize: 14, fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>
            </div>
          </label>
          <p style={{ margin: '-6px 0 14px', fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.4)' }}>
            {t('playgroundMembershipNote')}
          </p>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('foregroundLabel')}
              <input
                type="color"
                value={foreground}
                onChange={(event) => updateForeground(event.target.value)}
                style={{ width: 40, height: 30, padding: 0, borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', cursor: 'pointer' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('backgroundLabel')}
              <input
                type="color"
                value={background}
                onChange={(event) => updateBackground(event.target.value)}
                style={{ width: 40, height: 30, padding: 0, borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', cursor: 'pointer' }}
              />
            </label>
            <label
              title={t('brandIconLockedHint')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.82)', fontWeight: 600, alignSelf: 'flex-end', paddingBottom: 7, cursor: 'not-allowed' }}
            >
              <input
                type="checkbox"
                checked={brandIcon}
                onChange={() => toast.error(t('brandIconLockedHint'))}
                style={{ cursor: 'not-allowed' }}
              />
              {t('brandIconLabel')}
              <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
            </label>
          </div>

          {phase === 'idle' && (
            <div>
              {/* Always clickable, never a dead/disabled-looking button --
                  clicking with an empty or invalid short link shows a toast,
                  focuses the field, and highlights it red instead of just
                  silently doing nothing. */}
              <button
                type="button"
                onClick={handleGenerateClick}
                style={{
                  padding: '11px 22px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff',
                  fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(41,121,255,0.35)',
                }}
              >
                {t('playgroundGenerateButton')}
              </button>
            </div>
          )}

          {/* The captcha gates generating a code at all, not a backend call
              -- this preview never hits the API, but requiring it here still
              raises the cost of scripted mass-generation of the public page,
              same intent as the real create form's gate. Editing anything
              after this (see invalidateGeneration) sends phase back to
              'idle', so re-generating needs a fresh solve too.
              Deliberately NOT wiring onReset to back out of this phase --
              cap-widget fires its own 'reset' event as a normal part of its
              internal lifecycle (not just "user cancelled"), and treating it
              as a cancel was unmounting the whole widget the moment someone
              clicked the checkbox, before it ever got to solve. Only a real
              'solve' advances the phase; only editing the input backs out. */}
          {phase === 'verifying' && (
            <CaptchaWidget
              apiEndpoint={CAPTCHA_API_ENDPOINT}
              resetKey={captchaResetKey}
              onSolve={() => setPhase('generated')}
              onError={() => toast.error(t('playgroundCaptchaError'))}
            />
          )}

          {/* The resolved short link is now shown (and copyable) directly in
              the Short link field above once generated -- no separate
              duplicate copy line needed here. */}
          {phase === 'generated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={downloading}
                  onClick={handleDownload}
                  style={{
                    padding: '11px 22px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff',
                    fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: downloading ? 0.65 : 1,
                    boxShadow: '0 6px 20px rgba(41,121,255,0.35)',
                  }}
                >
                  {downloading ? t('downloading') : t('downloadButton')}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  style={{
                    padding: '11px 22px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.22)', background: 'transparent',
                    color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {t('playgroundShareButton')}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    padding: '11px 22px', borderRadius: 11, border: 'none', background: 'transparent',
                    color: 'rgba(255,255,255,0.56)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {t('playgroundResetButton')}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.4)', maxWidth: 380 }}>
                {t('playgroundAnonymousDestinationNote')}
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifySelf: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: QR_PREVIEW_SIZE,
              height: QR_PREVIEW_SIZE,
              background,
              padding: 18,
              borderRadius: 16,
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* key={phase} forces a remount on every phase change, so the
                reveal animation below actually retriggers when the real QR
                replaces the placeholder, instead of only playing once ever. */}
            <div key={phase} style={{ position: 'relative', animation: phase === 'generated' ? 'qr-reveal 0.5s cubic-bezier(0.16,0.9,0.3,1) both' : undefined }}>
              {/* react-qr-code's .d.ts declares this as a plain class component,
                  but the real implementation forwards the ref straight to the
                  rendered <svg> -- see the identical workaround comment in
                  panel/qr/page.tsx. Before generation this is a real, working
                  QR too -- it just points at hashpass.club instead of the
                  slug being built, so scanning the "placeholder" is never a
                  dead end. */}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <QRCode
                ref={svgRef as any}
                value={phase === 'generated' ? qrValue : DEFAULT_PREVIEW_VALUE}
                size={QR_PREVIEW_SIZE}
                bgColor={background}
                fgColor={foreground}
                level={effectiveLevel}
              />
              {brandIcon && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: badgeSize, height: badgeSize, borderRadius: '50%', background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- static export, no next/image loader available */}
                  <img src={BRAND_ICON_SRC} alt="" width={iconSize} height={iconSize} style={{ display: 'block' }} />
                </div>
              )}
            </div>

            {/* Scanning/generating effect while verifying -- overlays the
                still-visible placeholder QR rather than hiding it, so the
                panel reads as "working on it" instead of going blank. */}
            {phase === 'verifying' && (
              <div
                aria-hidden
                style={{
                  position: 'absolute', inset: 0, borderRadius: 16,
                  background: 'rgba(5,10,24,0.62)', backdropFilter: 'blur(1.5px)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  overflow: 'hidden',
                }}
              >
                <div className="qr-scan-line" />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#7de3b6', fontFamily: 'var(--font-mono)', animation: 'qr-pulse-dot 1.4s ease-in-out infinite' }}>
                  {t('playgroundGeneratingLabel')}
                </span>
              </div>
            )}
          </div>
          {phase !== 'generated' && (
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
              {t('playgroundPlaceholderHint')}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes qr-placeholder-fade {
          0% { opacity: 0; transform: translateY(-50%) translateX(4px); }
          15% { opacity: 1; transform: translateY(-50%) translateX(0); }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes qr-reveal {
          0% { opacity: 0; transform: scale(0.88); filter: blur(4px); }
          60% { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes qr-scan-sweep {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .qr-scan-line {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #7de3b6, transparent);
          box-shadow: 0 0 10px 1px rgba(125, 227, 182, 0.7);
          animation: qr-scan-sweep 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .qr-scan-line { animation: none; opacity: 0.5; }
        }
        @media (max-width: 640px) {
          .qr-playground-grid { grid-template-columns: minmax(0, 1fr) !important; }
          /* Stacked on mobile, the QR preview should read first and the
             Generate/verify/download action should land as the actual last
             thing on the card, not buried above the QR box. Desktop's
             side-by-side order (controls left, QR right) is untouched --
             this only reorders how the same two grid children stack. */
          .qr-playground-grid > *:first-child { order: 2; }
          .qr-playground-grid > *:last-child { order: 1; }
        }
      `}</style>
    </div>
  );
}

function StepsSection() {
  const { t } = useTranslation('qrShowcase');

  return (
    <section id="qr-how-it-works" style={{ padding: 'clamp(64px, 10vw, 120px) 24px', background: 'var(--bg-canvas)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ maxWidth: 640, marginBottom: 'clamp(40px, 6vw, 64px)' }}>
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
            {t('stepsEyebrow')}
          </span>
          <h2 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 700, letterSpacing: -1.3, lineHeight: 1.12, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: 0 }}>
            {t('stepsTitle')}
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'clamp(20px, 3vw, 28px)' }}>
          {STEP_KEYS.map((key, index) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: '50%', border: '1.5px solid var(--accent)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}
              >
                {String(index + 1).padStart(2, '0')}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: -0.3 }}>
                {t(`${key}Title`)}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)', margin: 0 }}>
                {t(`${key}Body`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useTranslation('qrShowcase');

  return (
    <section style={{ padding: 'clamp(64px, 10vw, 120px) 24px', background: 'var(--bg-canvas-alt)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ maxWidth: 640, marginBottom: 'clamp(40px, 6vw, 72px)' }}>
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
            {t('featuresEyebrow')}
          </span>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: '0 0 16px' }}>
            {t('featuresTitle')}
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
            {t('featuresSubtitle')}
          </p>
        </div>

        <div
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1,
            background: 'var(--border)', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--border)',
          }}
        >
          {FEATURE_KEYS.map((key, index) => (
            <div
              key={key}
              style={{ background: 'var(--bg-surface)', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 14, transition: 'background 0.2s', cursor: 'default' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-raised)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
            >
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12, background: `${FEATURE_ACCENTS[index]}18`, border: `1px solid ${FEATURE_ACCENTS[index]}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}
              >
                {FEATURE_ICONS[index]}
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: -0.3 }}>
                  {t(`feature${key}Title`)}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)', margin: 0 }}>
                  {t(`feature${key}Body`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EngineSection() {
  const { t } = useTranslation('qrShowcase');
  const [engineLive, setEngineLive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!LINKS_ORIGIN) return;
    let cancelled = false;
    fetch(`${LINKS_ORIGIN}/api/health`)
      .then((res) => { if (!cancelled) setEngineLive(res.ok); })
      .catch(() => { if (!cancelled) setEngineLive(false); });
    return () => { cancelled = true; };
  }, []);

  // Always the primary short-link domain here, deliberately not derived
  // from LINKS_ORIGIN/NEXT_PUBLIC_LINKS_API_BASE_URL -- that env var points
  // at whatever's actually configured for this deploy (a local dev-server
  // URL, a raw AWS invoke URL pre-cutover, etc.), which is correct for the
  // real app to call but wrong to show a visitor as "the" HASHPASS
  // short-link domain. The live reachability check below still uses the
  // real LINKS_ORIGIN -- only this illustrative example is hardcoded.
  const shortLinkExample = 'hpass.id/q/your-club';
  // Custom-domain-per-club routing isn't built yet (no wildcard DNS/ACM, no
  // tenant-resolution-by-subdomain in packages/hashpass-links-api) -- shown
  // here as a labeled "coming soon" teaser only, never as a live example.
  const customDomainExample = 'your-club.hashpass.link/your-slug';

  return (
    <section style={{ padding: 'clamp(64px, 10vw, 110px) 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
          {t('engineEyebrow')}
        </span>
        <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.18, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: '0 0 18px' }}>
          {t('engineTitle')}
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.75, color: 'var(--text-secondary)', maxWidth: 640, margin: '0 auto 32px' }}>
          {t('engineBody')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, textAlign: 'left' }}>
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '20px 24px', borderRadius: 16, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              {t('engineFreeLabel')}
            </span>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--accent)', fontWeight: 600 }}>
              {shortLinkExample}
            </code>
            {engineLive !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: engineLive ? 'var(--success)' : 'var(--text-faint)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {engineLive ? t('engineStatusLive') : t('engineStatusUnknown')}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '20px 24px', borderRadius: 16, border: '1px dashed var(--border-strong)', background: 'transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              {t('engineCustomLabel')}
              <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
                {t('engineCustomBadge')}
              </span>
            </span>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {customDomainExample}
            </code>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-faint)', margin: 0 }}>
              {t('engineCustomBody')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  const { t } = useTranslation('qrShowcase');

  return (
    <section style={{ padding: 'clamp(64px, 10vw, 120px) 24px', background: 'var(--bg-canvas-alt)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 740, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          {t('finalEyebrow')}
        </span>
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.05, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: 0 }}>
          {t('finalTitle')}
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: 520, margin: 0 }}>
          {t('finalSubtitle')}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <Link
            href="/panel/qr"
            style={{
              padding: '14px 32px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 15,
              letterSpacing: -0.2, transition: 'opacity 0.2s, transform 0.15s', boxShadow: '0 4px 20px var(--accent-glow)', textDecoration: 'none',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
          >
            {t('finalPrimary')}
          </Link>
          <Link
            href="/"
            style={{
              padding: '14px 32px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', fontWeight: 600, fontSize: 15, letterSpacing: -0.2, transition: 'border-color 0.2s, transform 0.15s',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
          >
            {t('finalSecondary')}
          </Link>
        </div>
      </div>
    </section>
  );
}
