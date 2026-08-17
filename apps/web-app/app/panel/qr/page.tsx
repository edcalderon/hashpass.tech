'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { HashpassError, type QrLink, type QrLinkAnalytics, type QrVisualConfig } from '@hashpass/sdk';
import { useTranslation } from '@hashpass/i18n';
// Direct subpath import, not the package's main barrel (@hashpass/ui) --
// that barrel re-exports HeroCard.tsx, which pulls in expo-image (a
// React-Native-only package Next's webpack build can't parse). This is the
// first thing apps/web-app has ever imported from @hashpass/ui; see that
// package's package.json "exports" for the subpath that makes this safe.
import { CaptchaWidget } from '@hashpass/ui/CaptchaWidget';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { useSession } from '../../components/SessionProvider';
import { useToast } from '../../components/Toast';
import { hashpassSdk } from '../../../lib/hashpass-sdk';
import { downloadQrPng } from '../../../lib/qr-image';
import {
  beginQrLinkEdit,
  deleteConfirmationMatches,
  destinationInputFromUrl,
  paginateQrLinks,
  resolveQrLinkAvailability,
  toHttpsDestination,
  type QrLinkFormState,
} from '../../../lib/qr-link-editor';

// The QR creation/management section of the panel -- see
// .agents/active/task-panel-web-club-events-qr.md, Phase B. Talks to
// packages/hashpass-links-api's live qr-links routes via
// hashpassSdk().qrLinks. `NEXT_PUBLIC_LINKS_API_BASE_URL` has no stable
// default yet (hashpass.link DNS/infra pending, see that package's
// README "hashpass.link cutover"), so the short link shown/copied here is
// whatever invoke URL that env var currently resolves to.
const LINKS_ORIGIN = (process.env.NEXT_PUBLIC_LINKS_API_BASE_URL || '').replace(/\/$/, '');
const SHORT_LINK_PREFIX = LINKS_ORIGIN ? `${LINKS_ORIGIN}/q/` : 'hashpass.link/q/';
// Bot protection on link creation (see packages/hashpass-links-api/src/routes/qr-links.ts's
// createQrLink) -- same Cap (proof-of-work, no third-party keys) flow the
// newsletter signup uses, via the shared @hashpass/ui CaptchaWidget.
const CAPTCHA_API_ENDPOINT = `${LINKS_ORIGIN}/api/captcha`;

// The square icon-only HASHPASS mark (not the wide logotype in
// hashpass-logo.tsx) -- the right shape for a small centered QR badge.
const BRAND_ICON_SRC = '/icon-512.png';
const PREVIEW_SIZE = 108;
const QR_LINKS_PER_PAGE = 3;

type FetchState = 'loading' | 'ready' | 'not-configured' | 'error';
type SlugAvailabilityState = 'idle' | 'current' | 'checking' | 'available' | 'taken' | 'invalid';
type ConfirmationAction = { kind: 'archive' | 'delete'; link: QrLink };

type FormState = QrLinkFormState;

const EMPTY_FORM: FormState = {
  name: '',
  publicSlug: '',
  destinationUrl: '',
  description: '',
  campaignSource: '',
  campaignMedium: '',
  campaignName: '',
  availability: 'permanent',
  startsAt: '',
  expiresAt: '',
};

function shortLinkFor(slug: string): string {
  return LINKS_ORIGIN ? `${LINKS_ORIGIN}/q/${slug}` : `/q/${slug}`;
}

export default function PanelQrPage() {
  const { t } = useTranslation('panelQr');
  const { t: tPanel } = useTranslation('panel');
  const { user, isLoading: sessionLoading } = useSession();
  const toast = useToast();

  const [links, setLinks] = useState<QrLink[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<FetchState>('loading');
  const [formOpen, setFormOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalSlug, setOriginalSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugAvailability, setSlugAvailability] = useState<SlugAvailabilityState>('idle');
  const [focusEditor, setFocusEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const [deleteAcknowledgement, setDeleteAcknowledgement] = useState('');
  const [analytics, setAnalytics] = useState<Record<string, QrLinkAnalytics | 'loading' | 'error'>>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const pagination = paginateQrLinks(links, page, QR_LINKS_PER_PAGE);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await hashpassSdk().qrLinks.list();
      setLinks(data);
      setState('ready');
    } catch (error) {
      if (error instanceof HashpassError && error.code === 'configuration_error') {
        setState('not-configured');
      } else {
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (page !== pagination.currentPage) setPage(pagination.currentPage);
  }, [page, pagination.currentPage]);

  useEffect(() => {
    if (!formOpen || !focusEditor) return;

    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameInputRef.current?.focus({ preventScroll: true });
      setFocusEditor(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusEditor, formOpen]);

  useEffect(() => {
    const slug = form.publicSlug.trim();
    if (!formOpen || !slug) {
      setSlugAvailability('idle');
      return;
    }
    if (slug === originalSlug) {
      setSlugAvailability('current');
      return;
    }

    setSlugAvailability('checking');
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await hashpassSdk().qrLinks.slugAvailability(slug);
        if (!cancelled) setSlugAvailability(result.available ? 'available' : 'taken');
      } catch {
        if (!cancelled) setSlugAvailability('invalid');
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [form.publicSlug, formOpen, originalSlug]);

  function openCreateForm() {
    setEditingId(null);
    setOriginalSlug(null);
    setForm(EMPTY_FORM);
    setCampaignOpen(false);
    setFocusEditor(false);
    setPage(1);
    setCaptchaToken(null);
    setFormOpen(true);
  }

  function openEditForm(link: QrLink) {
    const session = beginQrLinkEdit(link);
    setEditingId(link.id);
    setOriginalSlug(link.publicSlug);
    setForm(session.form);
    setCampaignOpen(session.campaignOpen);
    setFocusEditor(session.focusEditor);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setOriginalSlug(null);
    setForm(EMPTY_FORM);
    setFocusEditor(false);
    setCaptchaToken(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 1) {
      toast.error(t('formNameRequired'));
      return;
    }
    let destinationUrl: string;
    try {
      destinationUrl = toHttpsDestination(form.destinationUrl);
    } catch {
      toast.error(t('formInvalidDestination'));
      return;
    }
    let availability: { startsAt: string | null; expiresAt: string | null };
    try {
      availability = resolveQrLinkAvailability(form.availability, form.startsAt, form.expiresAt);
    } catch {
      toast.error(t('formInvalidAvailability'));
      return;
    }

    const campaign =
      form.campaignSource || form.campaignMedium || form.campaignName
        ? {
            source: form.campaignSource || undefined,
            medium: form.campaignMedium || undefined,
            campaign: form.campaignName || undefined,
          }
        : undefined;
    const changedSlug = form.publicSlug.trim() && form.publicSlug.trim() !== originalSlug
      ? form.publicSlug.trim()
      : undefined;
    if (slugAvailability === 'taken') {
      toast.error(t('formSlugTaken'));
      return;
    }
    if (!editingId && !captchaToken) {
      toast.error(t('formCaptchaRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await hashpassSdk().qrLinks.update(editingId, {
          name: form.name.trim(),
          destinationUrl,
          description: form.description || null,
          campaign,
          ...availability,
          ...(changedSlug ? { publicSlug: changedSlug } : {}),
        });
        setLinks((current) => current.map((link) => (link.id === updated.id ? { ...link, ...updated } : link)));
        toast.success(t('toastUpdated'));
      } else {
        const created = await hashpassSdk().qrLinks.create({
          name: form.name.trim(),
          destinationUrl,
          description: form.description || undefined,
          campaign,
          ...availability,
          ...(form.publicSlug.trim() ? { publicSlug: form.publicSlug.trim() } : {}),
          // Checked above for !editingId, but TS can't see through that --
          // captchaToken is required on CreateQrLinkInput.
          captchaToken: captchaToken!,
        });
        setLinks((current) => [created, ...current]);
        toast.success(t('toastCreated'));
      }
      closeForm();
    } catch (error) {
      // A consumed/expired captcha token surfaces via the details payload
      // (see packages/hashpass-links-api's createQrLink) -- force a fresh
      // challenge rather than leaving the stale, already-submitted one.
      const details = error instanceof HashpassError ? (error.details as { captchaExpired?: boolean } | undefined) : undefined;
      if (details?.captchaExpired) {
        setCaptchaToken(null);
        setCaptchaResetKey((key) => key + 1);
      }
      toast.error(error instanceof HashpassError ? error.message : t('errorGeneric'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(link: QrLink) {
    const nextStatus = link.status === 'active' ? 'paused' : 'active';
    setPendingAction(link.id);
    try {
      const updated = await hashpassSdk().qrLinks.update(link.id, { status: nextStatus });
      setLinks((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      setPendingAction(null);
    }
  }

  function requestArchive(link: QrLink) {
    setDeleteAcknowledgement('');
    setConfirmation({ kind: 'archive', link });
  }

  function requestDelete(link: QrLink) {
    setDeleteAcknowledgement('');
    setConfirmation({ kind: 'delete', link });
  }

  async function confirmLifecycleAction() {
    if (!confirmation) return;
    const { kind, link } = confirmation;
    if (kind === 'delete' && !deleteConfirmationMatches(deleteAcknowledgement)) return;

    setPendingAction(link.id);
    try {
      if (kind === 'archive') {
        const updated = await hashpassSdk().qrLinks.update(link.id, { status: 'archived' });
        setLinks((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        toast.success(t('toastArchived'));
      } else {
        await hashpassSdk().qrLinks.delete(link.id);
        setLinks((current) => current.filter((item) => item.id !== link.id));
        setAnalytics((current) => {
          const next = { ...current };
          delete next[link.id];
          return next;
        });
        if (editingId === link.id) closeForm();
        toast.success(t('toastDeleted'));
      }
      setConfirmation(null);
    } catch (error) {
      toast.error(error instanceof HashpassError ? error.message : t('errorGeneric'));
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleAnalytics(link: QrLink) {
    setAnalytics((current) => {
      if (current[link.id] !== undefined) {
        const next = { ...current };
        delete next[link.id];
        return next;
      }
      return { ...current, [link.id]: 'loading' };
    });
    if (analytics[link.id] !== undefined) return;

    try {
      const result = await hashpassSdk().qrLinks.analytics(link.id);
      setAnalytics((current) => ({ ...current, [link.id]: result }));
    } catch {
      setAnalytics((current) => ({ ...current, [link.id]: 'error' }));
    }
  }

  async function copyLink(link: QrLink) {
    try {
      await navigator.clipboard.writeText(shortLinkFor(link.publicSlug));
      toast.success(t('toastCopied'));
    } catch {
      toast.error(t('errorGeneric'));
    }
  }

  async function shareLink(link: QrLink) {
    const url = shortLinkFor(link.publicSlug);
    if (navigator.share) {
      try {
        await navigator.share({ title: link.name, url });
      } catch (error) {
        // A user cancelling the native share sheet isn't a real failure.
        if (error instanceof Error && error.name !== 'AbortError') toast.error(t('errorGeneric'));
      }
      return;
    }
    await copyLink(link);
  }

  // Returns the updated link so QrLinkRow can surface a real validation
  // message (e.g. the server's contrast-ratio check) via HashpassError
  // instead of a generic failure.
  async function saveAppearance(link: QrLink, visualConfig: Partial<QrVisualConfig>): Promise<QrLink> {
    const updated = await hashpassSdk().qrLinks.update(link.id, { visualConfig });
    setLinks((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    return updated;
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
      <Navbar showMarketingLinks={false} hasHero={false} />
      <main style={{ flex: '1 0 auto', maxWidth: 880, margin: '0 auto', padding: 'clamp(120px, 14vw, 160px) 24px 80px' }}>
        {sessionLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Spinner />
          </div>
        ) : !user ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 'clamp(22px, 3.5vw, 28px)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px', fontFamily: 'var(--font-display)' }}>
              {tPanel('signInRequiredTitle')}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
              {tPanel('signInRequiredBody')}
            </p>
            <Link
              href="/"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 12, background: 'var(--accent)', color: '#ffffff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
            >
              {tPanel('backHome')}
            </Link>
          </div>
        ) : (
          <>
            <Link
              href="/panel"
              style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block', marginBottom: 18 }}
            >
              ← {t('backToPanel')}
            </Link>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>
                  {t('title')}
                </h1>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: 480 }}>
                  {t('subtitle')}
                </p>
              </div>
              {!formOpen && (
                <button type="button" onClick={openCreateForm} style={primaryButtonStyle}>
                  {t('createButton')}
                </button>
              )}
            </div>

            {formOpen && (
              <form ref={formRef} onSubmit={handleSubmit} style={cardStyle}>
                <Field label={t('formNameLabel')}>
                  <input
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                    placeholder={t('formNamePlaceholder')}
                    style={inputStyle}
                    maxLength={120}
                  />
                </Field>
                <Field label={t('formSlugLabel')}>
                  <div style={urlInputShellStyle}>
                    <span aria-hidden style={urlPrefixStyle}>{SHORT_LINK_PREFIX}</span>
                    <input
                      value={form.publicSlug}
                      onChange={(event) => setForm((current) => ({ ...current, publicSlug: event.target.value.toLowerCase() }))}
                      placeholder={t('formSlugPlaceholder')}
                      aria-label={t('formSlugLabel')}
                      autoCapitalize="none"
                      autoCorrect="off"
                      maxLength={48}
                      style={urlInputStyle}
                    />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{t('formSlugHint')}</p>
                  {slugAvailability !== 'idle' && (
                    <p
                      style={{
                        margin: '5px 0 0', fontSize: 12, fontWeight: 700,
                        color: slugAvailability === 'taken' || slugAvailability === 'invalid'
                          ? 'var(--danger)'
                          : slugAvailability === 'available' || slugAvailability === 'current'
                            ? 'var(--success)'
                            : 'var(--text-faint)',
                      }}
                    >
                      {slugAvailability === 'checking'
                        ? t('formSlugChecking')
                        : slugAvailability === 'available'
                          ? t('formSlugAvailable')
                          : slugAvailability === 'current'
                            ? t('formSlugCurrent')
                            : slugAvailability === 'taken'
                              ? t('formSlugTaken')
                              : t('formSlugInvalid')}
                    </p>
                  )}
                </Field>
                <Field label={t('formDestinationLabel')}>
                  <div style={urlInputShellStyle}>
                    <span aria-hidden style={urlPrefixStyle}>https://</span>
                    <input
                      value={form.destinationUrl}
                      onChange={(event) => setForm((f) => ({ ...f, destinationUrl: destinationInputFromUrl(event.target.value) }))}
                      placeholder="www.example.com/path"
                      aria-label={t('formDestinationLabel')}
                      autoCapitalize="none"
                      autoCorrect="off"
                      inputMode="url"
                      style={urlInputStyle}
                    />
                  </div>
                </Field>
                <Field label={t('formDescriptionLabel')}>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
                    placeholder={t('formDescriptionPlaceholder')}
                    style={inputStyle}
                    maxLength={1000}
                  />
                </Field>

                <Field label={t('formAvailabilityLabel')}>
                  <div role="radiogroup" aria-label={t('formAvailabilityLabel')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['permanent', 'expiring', 'scheduled'] as const).map((mode) => {
                      const selected = form.availability === mode;
                      return (
                        <label
                          key={mode}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10,
                            border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
                            background: selected ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          }}
                        >
                          <input
                            type="radio"
                            name="qr-availability"
                            value={mode}
                            checked={selected}
                            onChange={() => setForm((current) => ({ ...current, availability: mode }))}
                          />
                          {mode === 'permanent'
                            ? t('formAvailabilityPermanent')
                            : mode === 'expiring'
                              ? t('formAvailabilityExpiring')
                              : t('formAvailabilityScheduled')}
                        </label>
                      );
                    })}
                  </div>
                </Field>

                {form.availability !== 'permanent' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 8 }}>
                    {form.availability === 'scheduled' && (
                      <Field label={t('formStartsAtLabel')}>
                        <input
                          type="datetime-local"
                          value={form.startsAt}
                          onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                          style={inputStyle}
                        />
                      </Field>
                    )}
                    <Field label={t('formExpiresAtLabel')}>
                      <input
                        type="datetime-local"
                        value={form.expiresAt}
                        onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                        style={inputStyle}
                      />
                    </Field>
                    <p style={{ gridColumn: '1 / -1', margin: '-4px 0 8px', fontSize: 12, color: 'var(--text-faint)' }}>
                      {form.availability === 'scheduled' ? t('formAvailabilityHint') : t('formExpiringHint')}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setCampaignOpen((open) => !open)}
                  style={{ ...linkButtonStyle, marginBottom: campaignOpen ? 12 : 0 }}
                >
                  {campaignOpen ? '▾' : '▸'} {t('formCampaignToggle')}
                </button>
                {campaignOpen && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 8 }}>
                    <Field label={t('formCampaignSourceLabel')}>
                      <input
                        value={form.campaignSource}
                        onChange={(event) => setForm((f) => ({ ...f, campaignSource: event.target.value }))}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label={t('formCampaignMediumLabel')}>
                      <input
                        value={form.campaignMedium}
                        onChange={(event) => setForm((f) => ({ ...f, campaignMedium: event.target.value }))}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label={t('formCampaignNameLabel')}>
                      <input
                        value={form.campaignName}
                        onChange={(event) => setForm((f) => ({ ...f, campaignName: event.target.value }))}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                )}

                {!editingId && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      {t('formCaptchaLabel')}
                    </span>
                    <CaptchaWidget
                      apiEndpoint={CAPTCHA_API_ENDPOINT}
                      resetKey={captchaResetKey}
                      onSolve={setCaptchaToken}
                      onReset={() => setCaptchaToken(null)}
                      onError={() => toast.error(t('formCaptchaError'))}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    type="submit"
                    disabled={saving || (!editingId && !captchaToken)}
                    style={{ ...primaryButtonStyle, opacity: saving || (!editingId && !captchaToken) ? 0.6 : 1 }}
                  >
                    {editingId ? t('formSubmitSave') : t('formSubmitCreate')}
                  </button>
                  <button type="button" onClick={closeForm} style={secondaryButtonStyle}>
                    {t('formCancel')}
                  </button>
                </div>
              </form>
            )}

            <div style={{ marginTop: 28 }}>
              {state === 'loading' && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <Spinner />
                </div>
              )}

              {state === 'not-configured' && (
                <EmptyCard title={t('errorTitle')} body={t('errorNotConfigured')} />
              )}

              {state === 'error' && <EmptyCard title={t('errorTitle')} body={t('errorGeneric')} />}

              {state === 'ready' && links.length === 0 && (
                <EmptyCard title={t('emptyTitle')} body={t('emptyBody')} />
              )}

              {state === 'ready' &&
                pagination.items.map((link) => (
                  <QrLinkRow
                    key={link.id}
                    link={link}
                    editing={editingId === link.id}
                    busy={pendingAction === link.id}
                    analytics={analytics[link.id]}
                    onEdit={() => openEditForm(link)}
                    onToggleActive={() => toggleActive(link)}
                    onArchive={() => requestArchive(link)}
                    onDelete={() => requestDelete(link)}
                    onToggleAnalytics={() => toggleAnalytics(link)}
                    onCopy={() => copyLink(link)}
                    onShare={() => shareLink(link)}
                    onSaveAppearance={(visualConfig) => saveAppearance(link, visualConfig)}
                    toast={toast}
                    t={t}
                  />
                ))}

              {state === 'ready' && links.length > QR_LINKS_PER_PAGE && (
                <nav aria-label={t('paginationLabel')} style={paginationStyle}>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={pagination.currentPage === 1}
                    style={{ ...paginationButtonStyle, opacity: pagination.currentPage === 1 ? 0.45 : 1 }}
                  >
                    {t('paginationPrevious')}
                  </button>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>
                    {t('paginationStatus', { current: pagination.currentPage, total: pagination.pageCount })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}
                    disabled={pagination.currentPage === pagination.pageCount}
                    style={{ ...paginationButtonStyle, opacity: pagination.currentPage === pagination.pageCount ? 0.45 : 1 }}
                  >
                    {t('paginationNext')}
                  </button>
                </nav>
              )}
            </div>

            <QrLinkConfirmationDialog
              action={confirmation}
              acknowledgement={deleteAcknowledgement}
              processing={confirmation !== null && pendingAction === confirmation.link.id}
              onAcknowledgementChange={setDeleteAcknowledgement}
              onCancel={() => setConfirmation(null)}
              onConfirm={confirmLifecycleAction}
              t={t}
            />
          </>
        )}
      </main>
      <Footer />
      <style>{`@keyframes panel-spin { to { transform: rotate(360deg); } }
        dialog::backdrop { background: rgba(1, 8, 24, 0.76); backdrop-filter: blur(5px); }
      `}</style>
    </div>
  );
}

function Spinner() {
  return (
    <div
      aria-hidden
      style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'panel-spin 0.8s linear infinite' }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{title}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

const STATUS_COLOR: Record<QrLink['status'], string> = {
  active: 'var(--success)',
  paused: 'var(--warning)',
  expired: 'var(--danger)',
  archived: 'var(--text-faint)',
};

function QrLinkRow({
  link,
  editing,
  busy,
  analytics,
  onEdit,
  onToggleActive,
  onArchive,
  onDelete,
  onToggleAnalytics,
  onCopy,
  onShare,
  onSaveAppearance,
  toast,
  t,
}: {
  link: QrLink;
  editing: boolean;
  busy: boolean;
  analytics: QrLinkAnalytics | 'loading' | 'error' | undefined;
  onEdit: () => void;
  onToggleActive: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleAnalytics: () => void;
  onCopy: () => void;
  onShare: () => void;
  onSaveAppearance: (visualConfig: Partial<QrVisualConfig>) => Promise<QrLink>;
  toast: { success: (message: string) => void; error: (message: string) => void };
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const shortUrl = shortLinkFor(link.publicSlug);
  const canReactivate = link.status !== 'archived' && link.status !== 'expired';

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draft, setDraft] = useState<{ foreground: string; background: string; logo: boolean }>({
    foreground: link.visualConfig.foreground,
    background: link.visualConfig.background,
    logo: link.visualConfig.logo,
  });
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const displayConfig = customizeOpen ? draft : link.visualConfig;
  const effectiveLevel = displayConfig.logo ? 'H' : link.visualConfig.errorCorrection;
  const iconSize = PREVIEW_SIZE * 0.2;
  const badgeSize = iconSize * 1.32;

  function toggleCustomize() {
    if (customizeOpen) {
      setCustomizeOpen(false);
      return;
    }
    setDraft({
      foreground: link.visualConfig.foreground,
      background: link.visualConfig.background,
      logo: link.visualConfig.logo,
    });
    setCustomizeOpen(true);
  }

  async function applyAppearance() {
    setSavingAppearance(true);
    try {
      await onSaveAppearance(draft);
      toast.success(t('toastAppearanceSaved'));
    } catch (error) {
      toast.error(error instanceof HashpassError ? error.message : t('errorGeneric'));
    } finally {
      setSavingAppearance(false);
    }
  }

  async function handleDownload() {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      const safeName = link.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await downloadQrPng(svgRef.current, {
        fileName: `${safeName || link.publicSlug}-qr.png`,
        brandIconSrc: displayConfig.logo ? BRAND_ICON_SRC : undefined,
        marginModules: link.visualConfig.margin,
        backgroundColor: displayConfig.background,
      });
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      aria-current={editing ? 'true' : undefined}
      style={{
        ...cardStyle,
        marginTop: 14,
        borderColor: editing ? 'var(--accent)' : cardStyle.borderColor,
        boxShadow: editing ? '0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent), 0 16px 36px color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
        background: editing ? 'color-mix(in srgb, var(--bg-surface-raised) 94%, var(--accent))' : cardStyle.background,
      }}
    >
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', background: displayConfig.background, padding: Math.max(8, link.visualConfig.margin * 2), borderRadius: 10, flexShrink: 0, alignSelf: 'flex-start' }}>
          <QRCode
            // react-qr-code's .d.ts declares this component as a plain class
            // (`class QRCode extends React.Component`), but the real
            // implementation (lib/index.mjs) is `forwardRef` straight to the
            // rendered <svg> DOM node -- the declared ref type is simply
            // wrong for what actually gets attached, and no combination of
            // `Ref<...>` satisfies its (incorrect) declared intersection
            // type. `any` here is a workaround for that stale third-party
            // declaration, not a real type hole in our own code.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={svgRef as any}
            value={shortUrl}
            size={PREVIEW_SIZE}
            bgColor={displayConfig.background}
            fgColor={displayConfig.foreground}
            level={effectiveLevel}
          />
          {displayConfig.logo && (
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

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[link.status], display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {t(`status${link.status.charAt(0).toUpperCase()}${link.status.slice(1)}`)}
            </span>
            {editing && <span style={editingBadgeStyle}>{t('editingLink')}</span>}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 4px' }}>{link.name}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 8px', wordBreak: 'break-all' }}>
            {t('destinationLabel')}: {link.destinationUrl}
          </p>
          <button type="button" onClick={onCopy} style={{ ...linkButtonStyle, fontFamily: 'var(--font-mono)', wordBreak: 'break-all', textAlign: 'left' }}>
            {shortUrl}
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '8px 0 0' }}>
            {t('scansLabel', { count: link.scanCount ?? 0 })} ·{' '}
            {link.lastScanAt ? new Date(link.lastScanAt).toLocaleString() : t('neverScanned')}
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button type="button" disabled={downloading} onClick={handleDownload} style={secondaryButtonStyle}>
              {t('actionDownload')}
            </button>
            <button type="button" onClick={onShare} style={secondaryButtonStyle}>{t('actionShare')}</button>
            <button type="button" onClick={toggleCustomize} style={secondaryButtonStyle}>
              {customizeOpen ? t('actionHideCustomize') : t('actionCustomize')}
            </button>
            <button type="button" onClick={onEdit} style={secondaryButtonStyle}>{t('actionEdit')}</button>
            {link.status !== 'archived' && link.status !== 'expired' && (
              <button type="button" disabled={busy} onClick={onToggleActive} style={secondaryButtonStyle}>
                {link.status === 'active' ? t('actionPause') : t('actionResume')}
              </button>
            )}
            {canReactivate && (
              <button type="button" disabled={busy} onClick={onArchive} style={dangerButtonStyle}>{t('actionArchive')}</button>
            )}
            <button type="button" disabled={busy} onClick={onDelete} style={deleteButtonStyle}>{t('actionDelete')}</button>
            <button type="button" onClick={onToggleAnalytics} style={secondaryButtonStyle}>
              {analytics === undefined ? t('actionAnalytics') : t('actionHideAnalytics')}
            </button>
          </div>

          {customizeOpen && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {t('customizeForeground')}
                  <input
                    type="color"
                    value={draft.foreground}
                    onChange={(event) => setDraft((d) => ({ ...d, foreground: event.target.value }))}
                    style={colorInputStyle}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {t('customizeBackground')}
                  <input
                    type="color"
                    value={draft.background}
                    onChange={(event) => setDraft((d) => ({ ...d, background: event.target.value }))}
                    style={colorInputStyle}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, alignSelf: 'flex-end', paddingBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={draft.logo}
                    onChange={(event) => setDraft((d) => ({ ...d, logo: event.target.checked }))}
                  />
                  {t('customizeBrandIcon')}
                </label>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 12px' }}>{t('customizeContrastHint')}</p>
              <button type="button" disabled={savingAppearance} onClick={applyAppearance} style={{ ...primaryButtonStyle, opacity: savingAppearance ? 0.6 : 1, padding: '9px 18px', fontSize: 13 }}>
                {t('customizeApply')}
              </button>
            </div>
          )}

          {analytics === 'loading' && <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12 }}>{t('analyticsLoading')}</p>}
          {analytics === 'error' && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 12 }}>{t('analyticsError')}</p>}
          {analytics && typeof analytics === 'object' && <AnalyticsPanel analytics={analytics} t={t} />}
        </div>
      </div>
    </div>
  );
}

function QrLinkConfirmationDialog({
  action,
  acknowledgement,
  processing,
  onAcknowledgementChange,
  onCancel,
  onConfirm,
  t,
}: {
  action: ConfirmationAction | null;
  acknowledgement: string;
  processing: boolean;
  onAcknowledgementChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (action && dialog && !dialog.open) dialog.showModal();
  }, [action]);

  if (!action) return null;
  const isDelete = action.kind === 'delete';
  const canConfirm = !processing && (!isDelete || deleteConfirmationMatches(acknowledgement));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="qr-confirmation-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!processing) onCancel();
      }}
      style={confirmationDialogStyle}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span aria-hidden style={{ ...confirmationIconStyle, color: isDelete ? 'var(--danger)' : 'var(--warning)' }}>{isDelete ? '×' : '!'}</span>
        <div>
          <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
            {isDelete ? t('deleteDialogEyebrow') : t('archiveDialogEyebrow')}
          </p>
          <h2 id="qr-confirmation-title" style={{ margin: '5px 0 8px', color: 'var(--text-primary)', fontSize: 22, fontFamily: 'var(--font-display)' }}>
            {isDelete ? t('deleteDialogTitle') : t('archiveDialogTitle')}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
            {isDelete ? t('deleteDialogBody', { name: action.link.name }) : t('archiveDialogBody', { name: action.link.name })}
          </p>
        </div>
      </div>

      {isDelete && (
        <label style={{ display: 'block', marginTop: 20 }}>
          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
            {t('deleteDialogPrompt')}
          </span>
          <input
            autoFocus
            value={acknowledgement}
            onChange={(event) => onAcknowledgementChange(event.target.value)}
            placeholder="DELETE"
            disabled={processing}
            style={inputStyle}
          />
        </label>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
        <button type="button" disabled={processing} onClick={onCancel} style={secondaryButtonStyle}>{t('formCancel')}</button>
        <button type="button" disabled={!canConfirm} onClick={onConfirm} style={{ ...deleteButtonStyle, opacity: canConfirm ? 1 : 0.45 }}>
          {processing ? t('actionWorking') : isDelete ? t('deleteDialogConfirm') : t('archiveDialogConfirm')}
        </button>
      </div>
    </dialog>
  );
}

function AnalyticsPanel({ analytics, t }: { analytics: QrLinkAnalytics; t: (key: string, params?: Record<string, string | number>) => string }) {
  const dayEntries = Object.entries(analytics.scansByDay).sort(([a], [b]) => (a < b ? -1 : 1));
  const maxDayCount = Math.max(1, ...dayEntries.map(([, count]) => count));

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {t('analyticsWindow', { days: analytics.windowDays })}
      </p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label={t('analyticsTotalScans')} value={analytics.totalScans} />
        <Stat label={t('analyticsHumanScans')} value={analytics.humanScans} />
        <Stat label={t('analyticsBotScans')} value={analytics.botScans} />
      </div>

      {dayEntries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{t('analyticsNoScans')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dayEntries.map(([day, count]) => (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 78, flexShrink: 0 }}>{day}</span>
              <div style={{ flex: 1, background: 'var(--bg-canvas-alt)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(count / maxDayCount) * 100}%`, background: 'var(--accent)', height: 8, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(analytics.scansByDevice).length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12, marginBottom: 0 }}>
          {t('analyticsByDevice')}:{' '}
          {Object.entries(analytics.scansByDevice)
            .map(([device, count]) => `${device} (${count})`)
            .join(', ')}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-strong)',
  borderRadius: 20,
  padding: 'clamp(20px, 3vw, 28px)',
  background: 'var(--bg-surface-raised)',
  marginTop: 24,
};

const paginationStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 22,
};

const paginationButtonStyle: React.CSSProperties = {
  padding: '8px 13px',
  borderRadius: 10,
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const editingBadgeStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: '3px 8px',
  color: 'var(--accent)',
  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.7,
  textTransform: 'uppercase',
};

const colorInputStyle: React.CSSProperties = {
  width: 44,
  height: 32,
  padding: 0,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 14,
  boxSizing: 'border-box',
};

const urlInputShellStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  boxSizing: 'border-box',
};

const urlPrefixStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  whiteSpace: 'nowrap',
};

const urlInputStyle: React.CSSProperties = {
  ...inputStyle,
  flex: 1,
  minWidth: 0,
  paddingLeft: 0,
  border: 'none',
  outline: 'none',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '11px 20px',
  borderRadius: 12,
  border: 'none',
  background: 'var(--accent)',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: 'var(--danger)',
  borderColor: 'var(--danger)',
};

const deleteButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: '#ffffff',
  borderColor: 'var(--danger)',
  background: 'var(--danger)',
};

const confirmationDialogStyle: React.CSSProperties = {
  width: 'min(460px, calc(100vw - 32px))',
  boxSizing: 'border-box',
  padding: 24,
  border: '1px solid var(--border-strong)',
  borderRadius: 18,
  background: 'var(--bg-surface-raised)',
  color: 'var(--text-primary)',
  boxShadow: '0 28px 80px rgba(0, 0, 0, 0.45)',
};

const confirmationIconStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: '50%',
  background: 'color-mix(in srgb, currentColor 14%, transparent)',
  border: '1px solid currentColor',
  fontSize: 19,
  fontWeight: 800,
};

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};
