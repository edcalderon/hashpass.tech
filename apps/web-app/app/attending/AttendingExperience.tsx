'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslation } from '@hashpass/i18n';
import { ActionButton, Badge, FormField, IconButton, ModalBackdrop, Surface } from '@hashpass/ui/primitives';
import { CaptchaWidget } from '@hashpass/ui/CaptchaWidget';
import { SettingsToggle } from '@hashpass/ui/settings-menu';
import { ArrowDownToLine, ArrowUpRight, CalendarDays, Check, ImagePlus, Instagram, MapPin, Share2, UserRound } from 'lucide-react';
import { drawAttendingArtwork } from '../../lib/attending-artwork';
import { formatAttendingEventDate } from '../../lib/attending-date';
import { getAttendingArtworkPublishEventUrl, getAttendingEventUrl, getAttendingLandingUrl, getGenericAttendingLandingHref, getGenericAttendingUrl } from '../../lib/attending-url';
import { getLinksApiOrigin } from '../../lib/links-api-origin';
import { resolveProfileAvatarUrl } from '../../lib/profile-avatar';
import { removePersonBackground } from '../../lib/remove-person-background';
import { ClubSettingsMenu } from '../components/ClubSettingsMenu';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { useSession } from '../components/SessionProvider';
import { SignInModal } from '../components/SignInModal';
import { useTheme } from '../components/ThemeProvider';
import { useToast } from '../components/Toast';
import { Footer } from '../components/Footer';
import { AttendingEventFooter } from './AttendingEventFooter';
import type {
  AttendingEventData,
  AttendeePhotoSource,
  AttendingPublicShare,
  AttendingPublicShareIntent,
  AttendingPublicShareResponse,
  AttendingExperienceProps,
  ProcessedAttendeePhoto,
} from './types/attending.types';
import styles from './attending.module.css';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PUBLIC_ARTWORK_BYTES = 4 * 1024 * 1024;

function metadataText(metadata: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase() || 'HP';
}

function normalizeSocialHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let handle = trimmed.replace(/^@+/, '');
  if (/^(https?:\/\/|www\.)/i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      handle = pathParts[0] || parsed.hostname.replace(/^www\./i, '');
    } catch {
      handle = trimmed;
    }
  }

  const cleaned = handle.replace(/^@+/, '').replace(/[/?#].*$/, '').replace(/\s+/g, '').slice(0, 40);
  return cleaned ? `@${cleaned}` : '';
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create image file.')), 'image/png');
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read artwork file.'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const separator = dataUrl.indexOf(',');
      if (separator < 0) {
        reject(new Error('Could not encode artwork file.'));
        return;
      }
      resolve(dataUrl.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export function AttendingExperience({
  event: baseEvent,
  customEvent = false,
  brandHref,
  footerHref,
  eventPageUrl,
  footerMode = 'tenant',
}: AttendingExperienceProps) {
  const { t } = useTranslation('attending');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const linksApiOrigin = getLinksApiOrigin();
  const { user, isLoading: sessionLoading, profileAvatarUrl } = useSession();
  const toast = useToast();
  const mode = resolvedTheme;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const customEventLogoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedPhotoRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [customEventName, setCustomEventName] = useState('');
  const [customEventDate, setCustomEventDate] = useState('');
  const [customEventLocation, setCustomEventLocation] = useState('');
  const [customEventLogo, setCustomEventLogo] = useState<string | null>(null);
  const [customEventTouched, setCustomEventTouched] = useState({ name: false, date: false, location: false });
  const [role, setRole] = useState('');
  const [xProfile, setXProfile] = useState('');
  const [instagramProfile, setInstagramProfile] = useState('');
  const [photoSource, setPhotoSource] = useState<AttendeePhotoSource>('initials');
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [removePhotoBackground, setRemovePhotoBackground] = useState(false);
  const [processedPhoto, setProcessedPhoto] = useState<ProcessedAttendeePhoto | null>(null);
  const [backgroundRemovalProcessing, setBackgroundRemovalProcessing] = useState(false);
  const [backgroundRemovalFailed, setBackgroundRemovalFailed] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const [pastEvent, setPastEvent] = useState(false);
  const [photoExportWarning, setPhotoExportWarning] = useState(false);
  const [lastAction, setLastAction] = useState<'copy' | 'download' | null>(null);
  const [shareDialogIntent, setShareDialogIntent] = useState<AttendingPublicShareIntent | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareEmailError, setShareEmailError] = useState<string | undefined>();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [isPublishingArtwork, setIsPublishingArtwork] = useState(false);
  const [publishedShare, setPublishedShare] = useState<AttendingPublicShare | null>(null);

  const event = useMemo<AttendingEventData>(() => {
    if (!customEvent) return baseEvent;
    const nameValue = customEventName.trim();
    return {
      ...baseEvent,
      name: nameValue || t('customEventNamePlaceholder'),
      shortName: nameValue || t('customEventCardEyebrow'),
      city: customEventLocation.trim(),
      country: '',
      startDate: customEventDate || null,
      endDate: customEventDate || null,
      dateFallback: null,
      logoSrc: customEventLogo || baseEvent.logoSrc,
    };
  }, [baseEvent, customEvent, customEventDate, customEventLocation, customEventLogo, customEventName, t]);
  const isBslEvent = !customEvent && (event.slug === 'bsl' || event.id === 'bsl' || event.id === 'colombia2026');
  const landingHref = brandHref ?? (customEvent ? getGenericAttendingLandingHref() : getAttendingLandingUrl());

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    const eventHost = hostname.match(/^([a-z0-9][a-z0-9-]{0,62})\.hashpass\.tech$/);
    if (!eventHost || !eventHost[1]) return;
    if (eventHost[1] !== event.slug.toLowerCase()) return;
    if (new URL(getAttendingEventUrl(event.slug)).pathname !== '/') return;
    if (window.location.pathname === '/') return;

    window.history.replaceState(
      window.history.state,
      '',
      `/${window.location.search}${window.location.hash}`,
    );
  }, [event.slug]);

  useEffect(() => {
    if (!shareDialogIntent) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPublishingArtwork) setShareDialogIntent(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shareDialogIntent, isPublishingArtwork]);

  const userMetadata = useMemo(
    () => (user?.user_metadata || {}) as Record<string, unknown>,
    [user?.user_metadata],
  );
  const profileName = metadataText(userMetadata, ['full_name', 'name', 'display_name']);
  const profileRole = [
    metadataText(userMetadata, ['job_title', 'title']),
    metadataText(userMetadata, ['company', 'organization']),
  ].filter(Boolean).join(' · ');
  const profileSocial = metadataText(userMetadata, ['social_handle', 'socialHandle', 'handle']);
  const profilePhoto = resolveProfileAvatarUrl(profileAvatarUrl, user);
  const currentPhoto = photoSource === 'hashpass'
    ? profilePhoto || null
    : photoSource === 'upload'
      ? uploadedPhoto
      : null;
  const artworkPhoto = removePhotoBackground && processedPhoto?.source === currentPhoto
    ? processedPhoto.url
    : currentPhoto;
  const transparentPortrait = removePhotoBackground && processedPhoto?.source === currentPhoto;

  const normalizedName = name.trim().replace(/\s+/gu, ' ');
  const isNameValid = Array.from(normalizedName).length >= 2 && /\p{L}/u.test(normalizedName);
  const nameError = nameTouched && !isNameValid
    ? normalizedName ? t('nameInvalidFeedback') : t('nameRequiredFeedback')
    : undefined;
  const normalizedEventName = customEventName.trim().replace(/\s+/gu, ' ');
  const normalizedEventLocation = customEventLocation.trim().replace(/\s+/gu, ' ');
  const isCustomEventValid = !customEvent || (
    Array.from(normalizedEventName).length >= 2
      && /^\d{4}-\d{2}-\d{2}$/.test(customEventDate)
      && Array.from(normalizedEventLocation).length >= 2
  );
  const customEventNameError = customEventTouched.name && Array.from(normalizedEventName).length < 2
    ? t('customEventNameRequired')
    : undefined;
  const customEventDateError = customEventTouched.date && !/^\d{4}-\d{2}-\d{2}$/.test(customEventDate)
    ? t('customEventDateRequired')
    : undefined;
  const customEventLocationError = customEventTouched.location && Array.from(normalizedEventLocation).length < 2
    ? t('customEventLocationRequired')
    : undefined;
  const eventName = event.name || event.shortName;
  const location = [event.city, event.country].filter(Boolean).join(', ');
  const dateLabel = formatAttendingEventDate(event, locale);
  const displayName = isNameValid ? normalizedName : t('yourName');
  const shareUrl = customEvent ? getGenericAttendingUrl() : eventPageUrl ?? getAttendingEventUrl(event.slug);
  const artUpcoming = t('artUpcoming');
  const artPast = t('artPast');
  const intentionLabel = pastEvent ? artPast : artUpcoming;
  const artEmptyName = t('yourName');
  const artPoweredBy = t('poweredBy');
  const shareText = `${intentionLabel} ${eventName}\n${event.artworkTemplate.hashtags.join(' ')}`;

  useEffect(() => {
    setPastEvent(!!event.endDate && event.endDate.slice(0, 10) < new Date().toISOString().slice(0, 10));
  }, [event.endDate]);

  useEffect(() => {
    if (!user) {
      if (previousUserIdRef.current) {
        setName('');
        setRole('');
        setXProfile('');
        setInstagramProfile('');
        setPhotoSource('initials');
        setUploadedPhoto(null);
        if (uploadedPhotoRef.current) URL.revokeObjectURL(uploadedPhotoRef.current);
        uploadedPhotoRef.current = null;
      }
      previousUserIdRef.current = null;
      return;
    }

    if (previousUserIdRef.current === user.id) return;
    previousUserIdRef.current = user.id;
    if (profileName) setName(profileName);
    if (profileRole) setRole(profileRole);
    if (profileSocial) {
      if (/instagram\.com/i.test(profileSocial)) setInstagramProfile(profileSocial);
      else setXProfile(profileSocial);
    }
    if (profilePhoto) setPhotoSource('hashpass');
    setSignInOpen(false);
  }, [user, profileName, profileRole, profileSocial, profilePhoto]);

  useEffect(() => () => {
    if (uploadedPhotoRef.current) URL.revokeObjectURL(uploadedPhotoRef.current);
  }, []);

  useEffect(() => {
    if (!removePhotoBackground || !currentPhoto) {
      setProcessedPhoto(null);
      setBackgroundRemovalProcessing(false);
      setBackgroundRemovalFailed(false);
      return;
    }

    let active = true;
    let generatedPhotoUrl: string | null = null;
    setProcessedPhoto(null);
    setBackgroundRemovalProcessing(true);
    setBackgroundRemovalFailed(false);

    void removePersonBackground(currentPhoto)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        generatedPhotoUrl = url;
        setProcessedPhoto({ source: currentPhoto, url });
      })
      .catch((error: unknown) => {
        console.error('Attending photo background removal failed', error);
        if (active) setBackgroundRemovalFailed(true);
      })
      .finally(() => {
        if (active) setBackgroundRemovalProcessing(false);
      });

    return () => {
      active = false;
      if (generatedPhotoUrl) URL.revokeObjectURL(generatedPhotoUrl);
    };
  }, [currentPhoto, removePhotoBackground]);

  const artOptions = useMemo(() => ({
    themeMode: mode,
    eventName,
    shortName: event.shortName,
    location,
    venue: event.venue,
    dateLabel,
    attendeeName: displayName,
    attendeeRole: role,
    attendeeSocialHandles: {
      x: normalizeSocialHandle(xProfile),
      instagram: normalizeSocialHandle(instagramProfile),
    },
    logoSrc: event.logoSrc,
    avatarSrc: artworkPhoto,
    transparentPortrait,
    artworkTemplate: event.artworkTemplate,
    poweredByLabel: artPoweredBy,
    pastEvent,
    intentions: {
      upcoming: artUpcoming,
      past: artPast,
      emptyName: artEmptyName,
    },
  }), [mode, eventName, event.shortName, event.logoSrc, event.artworkTemplate, event.venue, location, dateLabel, displayName, role, xProfile, instagramProfile, artworkPhoto, transparentPortrait, pastEvent, artUpcoming, artPast, artEmptyName, artPoweredBy]);

  useEffect(() => {
    setPublishedShare(null);
  }, [artOptions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    setArtReady(false);
    setPhotoExportWarning(false);

    void drawAttendingArtwork(canvas, artOptions).then((result) => {
      if (!active) return;
      setArtReady(true);
      setPhotoExportWarning(!!currentPhoto && !result.avatarIncluded);
    }).catch(() => {
      if (!active) return;
      setArtReady(false);
    });

    return () => { active = false; };
  }, [artOptions, currentPhoto]);

  function useHashpassProfile() {
    if (!user) {
      setSignInOpen(true);
      return;
    }
    if (profileName) setName(profileName);
    if (profileRole) setRole(profileRole);
    setPhotoSource(profilePhoto ? 'hashpass' : 'initials');
  }

  function handlePhotoUpload(changeEvent: ChangeEvent<HTMLInputElement>) {
    const file = changeEvent.currentTarget.files?.[0];
    changeEvent.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(t('uploadInvalid'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(t('uploadTooLarge'));
      return;
    }

    if (uploadedPhotoRef.current) URL.revokeObjectURL(uploadedPhotoRef.current);
    const nextPhoto = URL.createObjectURL(file);
    uploadedPhotoRef.current = nextPhoto;
    setUploadedPhoto(nextPhoto);
    setPhotoSource('upload');
  }

  async function handleCustomEventLogoUpload(changeEvent: ChangeEvent<HTMLInputElement>) {
    const file = changeEvent.currentTarget.files?.[0];
    changeEvent.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(t('uploadInvalid'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(t('uploadTooLarge'));
      return;
    }
    try {
      setCustomEventLogo(await fileToDataUrl(file));
    } catch {
      toast.error(t('uploadInvalid'));
    }
  }

  function clearCustomEventLogo() {
    setCustomEventLogo(null);
    if (customEventLogoInputRef.current) customEventLogoInputRef.current.value = '';
  }

  async function getArtFile(): Promise<File> {
    const canvas = canvasRef.current;
    if (!canvas || !artReady) throw new Error(t('artNotReady'));
    const blob = await canvasBlob(canvas);
    return new File([blob], `${customEvent ? 'event' : event.slug}-attending.png`, { type: 'image/png' });
  }

  function saveFile(file: File) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function requireValidEventDetails(): boolean {
    if (isCustomEventValid) return true;
    setCustomEventTouched({ name: true, date: true, location: true });
    toast.error(t('customEventRequiredFeedback'));
    return false;
  }

  function requireValidName(): boolean {
    if (!requireValidEventDetails()) return false;
    if (isNameValid) return true;
    setNameTouched(true);
    toast.error(normalizedName ? t('nameInvalidFeedback') : t('nameRequiredFeedback'));
    return false;
  }

  async function downloadArtwork() {
    if (!requireValidName()) return;
    try {
      const file = await getArtFile();
      saveFile(file);
      setLastAction('download');
      toast.success(t('downloaded'));
    } catch {
      toast.error(t('downloadError'));
    }
  }

  async function shareArtwork() {
    if (!requireValidName()) return;
    if (!publishedShare) {
      setShareDialogIntent('share');
      return;
    }
    try {
      const navigatorWithShare = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
        share?: (data?: ShareData) => Promise<void>;
      };
      if (navigatorWithShare.share) {
        await navigatorWithShare.share({
          title: `${t('shareTitle')} ${eventName}`,
          text: shareText,
          url: publishedShare.url,
        });
        return;
      }
      await copyPublicLink();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error(t('shareError'));
    }
  }

  async function copyPublicLink() {
    if (!publishedShare) return;
    try {
      await navigator.clipboard.writeText(publishedShare.url);
      setLastAction('copy');
      toast.success(t('linkCopied'));
    } catch {
      toast.error(t('copyError'));
    }
  }

  async function copyEventLink() {
    if (!requireValidName()) return;
    if (publishedShare) {
      await copyPublicLink();
      return;
    }
    setShareDialogIntent('copy');
  }

  async function openSocialShare(network: 'x' | 'linkedin') {
    if (!requireValidName()) return;
    if (!publishedShare) {
      setShareDialogIntent(network);
      return;
    }

    const xShareText = event.artworkTemplate.xHandle
      ? `${shareText}\n${event.artworkTemplate.xHandle}`
      : shareText;
    const target = network === 'x'
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(xShareText)}&url=${encodeURIComponent(publishedShare.url)}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publishedShare.url)}`;

    if (network === 'x') {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }

    // LinkedIn's share-offsite endpoint accepts a URL only; it silently
    // ignores post text parameters. Open the composer from this user gesture,
    // then copy the localized caption so it can be pasted into the post.
    const shareWindow = window.open('about:blank', '_blank');
    if (shareWindow) shareWindow.opener = null;
    try {
      await navigator.clipboard.writeText(shareText);
      if (shareWindow) shareWindow.location.href = target;
      toast.info(t('shareLinkedInHint'));
    } catch {
      if (shareWindow) shareWindow.location.href = target;
      toast.info(t('copyError'));
    }
  }

  async function publishArtwork() {
    if (!requireValidName()) return;
    if (!linksApiOrigin) {
      toast.error(t('shareApiUnavailable'));
      return;
    }
    if (!captchaToken) {
      toast.error(t('shareCaptchaPrompt'));
      return;
    }
    if (shareEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shareEmail.trim())) {
      setShareEmailError(t('shareEmailInvalid'));
      return;
    }

    setIsPublishingArtwork(true);
    try {
      const file = await getArtFile();
      if (file.size > MAX_PUBLIC_ARTWORK_BYTES) {
        toast.error(t('shareImageTooLarge'));
        return;
      }
      const response = await fetch(`${linksApiOrigin}/api/v1/attending-artworks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          captchaToken,
          imageBase64: await fileToBase64(file),
          eventSlug: event.slug,
          eventName,
          attendeeName: normalizedName,
          caption: shareText,
          eventUrl: getAttendingArtworkPublishEventUrl(event.slug, customEvent),
          locale,
          email: shareEmail.trim() || undefined,
        }),
      });
      const result = await response.json().catch(() => ({})) as AttendingPublicShareResponse;
      if (!response.ok || typeof result.shareUrl !== 'string' || typeof result.imageUrl !== 'string') {
        setCaptchaToken(null);
        setCaptchaResetKey((key) => key + 1);
        toast.error(result.captchaExpired ? t('shareCaptchaPrompt') : result.message || t('sharePublishError'));
        return;
      }

      setPublishedShare({
        url: result.shareUrl,
        imageUrl: result.imageUrl,
        expiresAt: result.expiresAt || '',
        emailStatus: result.emailStatus || 'not_requested',
      });
      setCaptchaToken(null);
      setShareEmailError(undefined);
      toast.success(t('sharePublicReady'));
      if (result.emailStatus === 'sent') toast.info(t('shareEmailSent'));
      else if (shareEmail.trim()) toast.info(t('shareEmailUnavailable'));
    } catch {
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
      toast.error(t('sharePublishError'));
    } finally {
      setIsPublishingArtwork(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href={landingHref} aria-label="HASHPASS Club attending home">
          <img src="/attending/logo-hashpass.svg" alt="" />
          <span>HASHPASS <b>CLUB</b></span>
        </a>
        <div className={styles.headerActions}>
          <ClubSettingsMenu
            size={42}
            triggerStyle={{
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }}
          />
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div>
            <p className={styles.eyebrow}><span className={styles.liveDot} />{customEvent ? t('customEventPageEyebrow') : t('pageEyebrow')}</p>
            <h1>{customEvent ? t('customEventPageTitle') : pastEvent ? t('pastPageTitle') : t('pageTitle')}</h1>
            <p className={styles.lead}>{customEvent ? t('customEventPageDescription') : t('pageDescription')}</p>
          </div>
          <div className={styles.eventMeta}>
            <Badge mode={mode} tone="neutral" compact>{event.shortName}</Badge>
            <span className={styles.eventName}>{eventName}</span>
            <span className={styles.eventDetails}>
              {dateLabel && <span><CalendarDays size={15} />{dateLabel}</span>}
              {location && <span><MapPin size={15} />{location}</span>}
            </span>
            {event.website && <a href={event.website} target="_blank" rel="noopener noreferrer">{t('eventWebsite')} <ArrowUpRight size={14} /></a>}
          </div>
        </section>

        <div className={styles.workspace}>
          <section className={styles.editor} aria-labelledby="attending-editor-title">
            <Surface mode={mode} style={{ width: '100%', padding: 0, overflow: 'hidden' }}>
              <div className={styles.editorInner}>
            {customEvent && (
              <section className={styles.customEventForm} aria-labelledby="custom-event-form-title">
                <div className={styles.sectionHeading}>
                  <span className={styles.stepNumber}>01</span>
                  <div>
                    <h2 id="custom-event-form-title">{t('customEventFormTitle')}</h2>
                    <p>{t('customEventFormDescription')}</p>
                  </div>
                </div>

                <div className={styles.customEventFields}>
                  <div className={styles.customEventWideField}>
                    <FormField
                      mode={mode}
                      label={`${t('customEventNameLabel')} · ${t('requiredField')}`}
                      value={customEventName}
                      onChangeText={setCustomEventName}
                      placeholder={t('customEventNamePlaceholder')}
                      maxLength={100}
                      onBlur={() => setCustomEventTouched((state) => ({ ...state, name: true }))}
                      error={customEventNameError}
                      accessibilityLabel={`${t('customEventNameLabel')} · ${t('requiredField')}`}
                    />
                  </div>
                  <div className={styles.customEventDateField}>
                    <label htmlFor="custom-event-date">{t('customEventDateLabel')} · {t('requiredField')}</label>
                    <input
                      id="custom-event-date"
                      className={styles.customEventDateInput}
                      type="date"
                      required
                      value={customEventDate}
                      aria-invalid={!!customEventDateError}
                      aria-describedby={customEventDateError ? 'custom-event-date-error' : undefined}
                      onChange={(changeEvent) => setCustomEventDate(changeEvent.currentTarget.value)}
                      onBlur={() => setCustomEventTouched((state) => ({ ...state, date: true }))}
                    />
                    {customEventDateError && <p className={styles.customEventFieldError} id="custom-event-date-error" role="alert">{customEventDateError}</p>}
                  </div>
                  <div>
                    <FormField
                      mode={mode}
                      label={`${t('customEventLocationLabel')} · ${t('requiredField')}`}
                      value={customEventLocation}
                      onChangeText={setCustomEventLocation}
                      placeholder={t('customEventLocationPlaceholder')}
                      maxLength={120}
                      onBlur={() => setCustomEventTouched((state) => ({ ...state, location: true }))}
                      error={customEventLocationError}
                      accessibilityLabel={`${t('customEventLocationLabel')} · ${t('requiredField')}`}
                    />
                  </div>
                </div>

                <div className={styles.customEventLogoField}>
                  <p className={styles.fieldHeading}>{t('customEventLogoLabel')}</p>
                  <label className={`${styles.sourceCard} ${customEventLogo ? styles.sourceActive : ''}`}>
                    <span className={styles.sourceIcon}><ImagePlus size={19} /></span>
                    <span>
                      <strong>{customEventLogo ? t('customEventLogoReady') : t('customEventLogoChoose')}</strong>
                      <small>{t('customEventLogoHint')}</small>
                    </span>
                    {customEventLogo && <Check className={styles.sourceCheck} size={16} />}
                    <input
                      ref={customEventLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className={styles.visuallyHidden}
                      onChange={handleCustomEventLogoUpload}
                      aria-label={t('customEventLogoLabel')}
                    />
                  </label>
                  {customEventLogo && (
                    <div className={styles.customEventLogoPreview}>
                      <img src={customEventLogo} alt="" />
                      <ActionButton mode={mode} label={t('customEventLogoRemove')} variant="ghost" onPress={clearCustomEventLogo} />
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className={styles.sectionHeading}>
              <span className={styles.stepNumber}>{customEvent ? '02' : '01'}</span>
              <div>
                <h2 id="attending-editor-title">{t('personalizeTitle')}</h2>
                <p>{t('personalizeBody')}</p>
              </div>
            </div>

            <div className={styles.profileSource}>
              <p className={styles.fieldHeading}>{t('profilePhotoLabel')}</p>
              <div className={styles.sourceGrid}>
                <button
                  type="button"
                  className={`${styles.sourceCard} ${photoSource === 'hashpass' ? styles.sourceActive : ''}`}
                  onClick={useHashpassProfile}
                  aria-pressed={photoSource === 'hashpass'}
                >
                  {user
                    ? <ProfileAvatar src={profilePhoto} name={profileName || user.email || ''} size={36} className={styles.sourceAvatar} />
                    : <span className={styles.sourceIcon}><UserRound size={19} /></span>}
                  <span><strong>{t('hashpassProfile')}</strong><small>{sessionLoading ? t('checkingProfile') : user ? t('profileConnected') : t('profileSignInHint')}</small></span>
                  {photoSource === 'hashpass' && <Check className={styles.sourceCheck} size={16} />}
                </button>
                <label className={`${styles.sourceCard} ${photoSource === 'upload' ? styles.sourceActive : ''}`}>
                  <span className={styles.sourceIcon}><ImagePlus size={19} /></span>
                  <span><strong>{t('uploadPhoto')}</strong><small>{t('uploadPhotoHint')}</small></span>
                  {photoSource === 'upload' && <Check className={styles.sourceCheck} size={16} />}
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={styles.visuallyHidden}
                    onChange={handlePhotoUpload}
                    aria-label={t('uploadPhoto')}
                  />
                </label>
                <button
                  type="button"
                  className={`${styles.sourceCard} ${photoSource === 'initials' ? styles.sourceActive : ''}`}
                  onClick={() => setPhotoSource('initials')}
                  aria-pressed={photoSource === 'initials'}
                >
                  <span className={styles.sourceIcon}><span className={styles.initialsPreview}>{initials(name)}</span></span>
                  <span><strong>{t('noPhoto')}</strong><small>{t('noPhotoHint')}</small></span>
                  {photoSource === 'initials' && <Check className={styles.sourceCheck} size={16} />}
                </button>
              </div>
              {currentPhoto && (
                <SettingsToggle
                  mode={mode}
                  label={t('removeBackground')}
                  description={backgroundRemovalProcessing ? t('removeBackgroundProcessing') : t('removeBackgroundHint')}
                  note={t('removeBackgroundPrivacy')}
                  checked={removePhotoBackground}
                  onChange={(nextValue) => {
                    setBackgroundRemovalFailed(false);
                    setRemovePhotoBackground(nextValue);
                  }}
                />
              )}
              {backgroundRemovalFailed && <p className={styles.socialNote} role="alert">{t('removeBackgroundError')}</p>}
              <p className={styles.socialNote}>{t('socialConnectionNote')}</p>
            </div>

            <div className={styles.fields}>
              <FormField
                mode={mode}
                label={`${t('nameLabel')} · ${t('requiredField')}`}
                value={name}
                onChangeText={setName}
                placeholder={t('namePlaceholder')}
                maxLength={42}
                onBlur={() => setNameTouched(true)}
                error={nameError}
                accessibilityLabel={`${t('nameLabel')} · ${t('requiredField')}`}
                accessibilityHint={t('nameActionHint')}
              />
              <FormField
                mode={mode}
                label={t('roleLabel')}
                value={role}
                onChangeText={setRole}
                placeholder={t('rolePlaceholder')}
                maxLength={54}
                accessibilityLabel={t('roleLabel')}
              />
            </div>
            <div className={styles.socialHandleFields}>
              <p className={styles.socialFieldsLabel}>{t('socialHandleLabel')}</p>
              <div className={styles.socialHandleField}>
                <span className={styles.socialHandleIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="19" height="19" focusable="false">
                    <path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19 9.46 12.504h-7.41l-5.804-7.588-6.64 7.588H.466l8.6-9.83L0 1.153h7.598l5.245 6.932z" />
                  </svg>
                </span>
                <FormField
                  mode={mode}
                  label={t('xHandleLabel')}
                  value={xProfile}
                  onChangeText={setXProfile}
                  placeholder={t('socialHandlePlaceholder')}
                  maxLength={120}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t('xHandleLabel')}
                  style={{ paddingLeft: 43 }}
                />
              </div>
              <div className={styles.socialHandleField}>
                <span className={styles.socialHandleIcon} aria-hidden="true"><Instagram size={19} strokeWidth={2} /></span>
                <FormField
                  mode={mode}
                  label={t('instagramHandleLabel')}
                  value={instagramProfile}
                  onChangeText={setInstagramProfile}
                  placeholder={t('socialHandlePlaceholder')}
                  maxLength={120}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t('instagramHandleLabel')}
                  style={{ paddingLeft: 43 }}
                />
              </div>
              <p className={styles.socialNote}>{t('socialHandleHint')}</p>
            </div>

            <div className={styles.privacyNote}>
              <span className={styles.privacyIcon}><Check size={16} /></span>
              <p>{t('privacyNote')}</p>
            </div>
              </div>
            </Surface>
          </section>

          <aside className={styles.preview} aria-labelledby="attending-preview-title">
            <Surface mode={mode} style={{ width: '100%', padding: 0, overflow: 'hidden' }}>
              <div className={styles.previewInner}>
            <div className={styles.previewHeading}>
              <div>
                <p className={styles.previewEyebrow}>{t('previewEyebrow')}</p>
                <h2 id="attending-preview-title">{t('previewTitle')}</h2>
              </div>
              <span className={styles.previewRatio}>4:5</span>
            </div>

            <div className={styles.artFrame}>
              <canvas
                ref={canvasRef}
                className={styles.artCanvas}
                width={1080}
                height={1350}
                role="img"
                aria-label={t('artAccessibleName', { event: eventName, attendee: displayName })}
              />
              {!artReady && <div className={styles.artLoading} aria-live="polite">{t('makingPreview')}</div>}
            </div>

            <p className={styles.disclaimer}>{t('intentionDisclaimer')}</p>
            {photoExportWarning && <p className={styles.exportWarning}>{t('photoExportWarning')}</p>}

            <div className={styles.actions}>
              <ActionButton
                mode={mode}
                label={t('shareImage')}
                leadingIcon={<Share2 size={17} />}
                onPress={shareArtwork}
                disabled={!hasHydrated || !artReady || !isNameValid || !isCustomEventValid}
                style={{ flex: 1 }}
              />
              <ActionButton
                mode={mode}
                label={t('downloadImage')}
                leadingIcon={<ArrowDownToLine size={17} />}
                variant="secondary"
                onPress={downloadArtwork}
                disabled={!hasHydrated || !artReady || !isNameValid || !isCustomEventValid}
                style={{ flex: 1 }}
              />
            </div>
            {!isNameValid && <p className={styles.nameRequirement} role="status">{t('nameActionHint')}</p>}
            {customEvent && !isCustomEventValid && <p className={styles.nameRequirement} role="status">{t('customEventActionHint')}</p>}

            <div className={styles.socialShare}>
              <span>{t('shareOn')}</span>
              <ActionButton
                mode={mode}
                label="X"
                trailingIcon={<ArrowUpRight size={14} />}
                variant="ghost"
                onPress={() => openSocialShare('x')}
                disabled={!isNameValid || !isCustomEventValid}
              />
              <ActionButton
                mode={mode}
                label="LinkedIn"
                trailingIcon={<ArrowUpRight size={14} />}
                variant="ghost"
                onPress={() => openSocialShare('linkedin')}
                disabled={!isNameValid || !isCustomEventValid}
              />
              <ActionButton
                mode={mode}
                label={t('copyPageLink')}
                leadingIcon={lastAction === 'copy' ? <Check size={14} /> : undefined}
                variant="ghost"
                onPress={copyEventLink}
                disabled={!isNameValid || !isCustomEventValid}
              />
            </div>
            <p className={styles.shareHint}>{t('shareHint')}</p>
              </div>
            </Surface>
          </aside>
        </div>

      </main>

      {isBslEvent && footerMode === 'tenant' ? (
        <AttendingEventFooter event={event} returnHref={footerHref ?? landingHref} />
      ) : (
        <Footer />
      )}
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
      {shareDialogIntent && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.shareDialogRoot}
          role="presentation"
          onMouseDown={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget && !isPublishingArtwork) {
              setShareDialogIntent(null);
              setCaptchaToken(null);
            }
          }}
        >
          <ModalBackdrop mode={mode} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' }} />
          <div className={styles.shareDialogPanel} role="dialog" aria-modal="true" aria-labelledby="attending-share-title">
            <Surface mode={mode} style={{ width: '100%', padding: 0, overflow: 'hidden' }}>
              <div className={styles.shareDialogContent}>
                <div className={styles.shareDialogHeader}>
                  <div>
                    <p className={styles.previewEyebrow}>{t('previewEyebrow')}</p>
                    <h2 id="attending-share-title">{publishedShare ? t('sharePublicReady') : t('shareDialogTitle')}</h2>
                  </div>
                  <IconButton
                    mode={mode}
                    label={t('shareDialogClose')}
                    onPress={() => {
                      setShareDialogIntent(null);
                      setCaptchaToken(null);
                    }}
                    disabled={isPublishingArtwork}
                  >
                    <span aria-hidden="true">×</span>
                  </IconButton>
                </div>

                {!publishedShare ? (
                  <>
                    <p className={styles.shareDialogDescription}>{t('shareDialogDescription')}</p>
                    <FormField
                      mode={mode}
                      label={t('shareEmailLabel')}
                      value={shareEmail}
                      onChangeText={(value) => {
                        setShareEmail(value);
                        setShareEmailError(undefined);
                      }}
                      placeholder={t('shareEmailPlaceholder')}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      maxLength={254}
                      error={shareEmailError}
                    />
                    <p className={styles.shareDialogPrivacy}>{t('shareEmailPrivacy')}</p>

                    {linksApiOrigin ? (
                      <div className={styles.shareCaptcha}>
                        <CaptchaWidget
                          apiEndpoint={`${linksApiOrigin}/api/captcha`}
                          lang={['es', 'fr', 'de', 'pt'].includes(locale.split('-')[0]) ? locale.split('-')[0] : undefined}
                          resetKey={captchaResetKey}
                          onSolve={setCaptchaToken}
                          onReset={() => setCaptchaToken(null)}
                          onError={() => {
                            setCaptchaToken(null);
                            toast.error(t('shareCaptchaUnavailable'));
                          }}
                        />
                        <p className={styles.shareCaptchaStatus} role="status">
                          {captchaToken ? t('shareCaptchaComplete') : t('shareCaptchaPrompt')}
                        </p>
                      </div>
                    ) : (
                      <p className={styles.shareDialogError} role="alert">{t('shareApiUnavailable')}</p>
                    )}

                    <div className={styles.shareDialogActions}>
                      <ActionButton
                        mode={mode}
                        label={t('shareCancel')}
                        variant="secondary"
                        onPress={() => {
                          setShareDialogIntent(null);
                          setCaptchaToken(null);
                        }}
                        disabled={isPublishingArtwork}
                      />
                      <ActionButton
                        mode={mode}
                        label={isPublishingArtwork ? t('sharePublishingButton') : t('sharePublishButton')}
                        onPress={publishArtwork}
                        disabled={isPublishingArtwork || !captchaToken || !linksApiOrigin}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.shareDialogDescription}>{t('sharePublicReady')}</p>
                    <FormField
                      mode={mode}
                      label={t('sharePublicLinkLabel')}
                      value={publishedShare.url}
                      editable={false}
                      selectTextOnFocus
                      autoCapitalize="none"
                    />
                    <div className={styles.shareDialogActions}>
                      <ActionButton
                        mode={mode}
                        label={t('shareCopyAction')}
                        leadingIcon={<Check size={16} />}
                        variant="secondary"
                        onPress={copyPublicLink}
                      />
                      <ActionButton
                        mode={mode}
                        label={t('shareLinkedInAction')}
                        trailingIcon={<ArrowUpRight size={14} />}
                        onPress={() => openSocialShare('linkedin')}
                      />
                      <ActionButton
                        mode={mode}
                        label={t('shareXAction')}
                        trailingIcon={<ArrowUpRight size={14} />}
                        variant="secondary"
                        onPress={() => openSocialShare('x')}
                      />
                    </div>
                    {publishedShare.emailStatus === 'sent' && <p className={styles.shareDialogSuccess} role="status">{t('shareEmailSent')}</p>}
                    {publishedShare.emailStatus === 'unavailable' && <p className={styles.shareDialogError} role="status">{t('shareEmailUnavailable')}</p>}
                    {shareDialogIntent === 'linkedin' && <p className={styles.shareDialogPrivacy}>{t('shareLinkedInHint')}</p>}
                  </>
                )}
              </div>
            </Surface>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
