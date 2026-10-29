'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocale, useSetLocale, useTranslation } from '@hashpass/i18n';
import { ActionButton, Badge, FormField, IconButton, SegmentedTabs, Surface } from '@hashpass/ui/primitives';
import { ArrowDownToLine, ArrowUpRight, CalendarDays, Check, ImagePlus, MapPin, Moon, Share2, Sun, UserRound } from 'lucide-react';
import { drawAttendingArtwork } from '../../lib/attending-artwork';
import { useSession } from '../components/SessionProvider';
import { SignInModal } from '../components/SignInModal';
import { useTheme } from '../components/ThemeProvider';
import { useToast } from '../components/Toast';
import type { AttendingEventData, AttendingLocale, AttendeePhotoSource } from './types/attending.types';
import styles from './attending.module.css';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function metadataText(metadata: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function formatDatePart(dateValue: string, locale: AttendingLocale, options: Intl.DateTimeFormatOptions): string {
  const datePart = dateValue.slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-CO' : 'en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(date);
}

function formatEventDate(event: AttendingEventData, locale: AttendingLocale): string {
  if (!event.startDate) return event.dateFallback || '';
  const start = formatDatePart(event.startDate, locale, { month: 'short', day: 'numeric' });
  if (!event.endDate) {
    const year = formatDatePart(event.startDate, locale, { year: 'numeric' });
    return `${start}, ${year}`;
  }
  const startParts = event.startDate.slice(0, 10).split('-').map(Number);
  const endParts = event.endDate.slice(0, 10).split('-').map(Number);
  if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
    const month = formatDatePart(event.startDate, locale, { month: 'short' });
    const startDay = formatDatePart(event.startDate, locale, { day: 'numeric' });
    const endDay = formatDatePart(event.endDate, locale, { day: 'numeric' });
    const year = formatDatePart(event.startDate, locale, { year: 'numeric' });
    return locale === 'es'
      ? `${startDay}–${endDay} ${month} ${year}`
      : `${month} ${startDay}–${endDay}, ${year}`;
  }
  const end = formatDatePart(event.endDate, locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return start && end ? `${start} – ${end}` : event.dateFallback || '';
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
      handle = pathParts[pathParts.length - 1] || parsed.hostname.replace(/^www\./i, '');
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

export function AttendingExperience({ event }: { event: AttendingEventData }) {
  const { t } = useTranslation('attending');
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const { user, isLoading: sessionLoading } = useSession();
  const toast = useToast();
  const mode = resolvedTheme;
  const language: AttendingLocale = locale === 'es' ? 'es' : 'en';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadedPhotoRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [socialProfile, setSocialProfile] = useState('');
  const [photoSource, setPhotoSource] = useState<AttendeePhotoSource>('initials');
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const [pastEvent, setPastEvent] = useState(false);
  const [photoExportWarning, setPhotoExportWarning] = useState(false);
  const [lastAction, setLastAction] = useState<'copy' | 'download' | null>(null);

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
  const profilePhoto = metadataText(userMetadata, ['avatar_url', 'picture', 'avatar', 'photo_url']);
  const currentPhoto = photoSource === 'hashpass'
    ? profilePhoto || null
    : photoSource === 'upload'
      ? uploadedPhoto
      : null;

  const eventName = event.name || event.shortName;
  const location = [event.city, event.country].filter(Boolean).join(', ');
  const dateLabel = formatEventDate(event, language);
  const intentionLabel = pastEvent ? t('artPast') : t('artUpcoming');
  const displayName = name.trim() || t('yourName');
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const artUpcoming = t('artUpcoming');
  const artPast = t('artPast');
  const artEmptyName = t('yourName');
  const artPoweredBy = t('poweredBy');

  useEffect(() => {
    setPastEvent(!!event.endDate && event.endDate.slice(0, 10) < new Date().toISOString().slice(0, 10));
  }, [event.endDate]);

  useEffect(() => {
    if (!user) {
      if (previousUserIdRef.current) {
        setName('');
        setRole('');
        setSocialProfile('');
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
    if (profileSocial) setSocialProfile(profileSocial);
    if (profilePhoto) setPhotoSource('hashpass');
    setSignInOpen(false);
  }, [user, profileName, profileRole, profileSocial, profilePhoto]);

  useEffect(() => () => {
    if (uploadedPhotoRef.current) URL.revokeObjectURL(uploadedPhotoRef.current);
  }, []);

  const artOptions = useMemo(() => ({
    eventName,
    shortName: event.shortName,
    location,
    venue: event.venue,
    dateLabel,
    attendeeName: displayName,
    attendeeRole: role,
    attendeeSocialHandle: normalizeSocialHandle(socialProfile),
    logoSrc: event.logoSrc,
    avatarSrc: currentPhoto,
    artworkTemplate: event.artworkTemplate,
    poweredByLabel: artPoweredBy,
    pastEvent,
    intentions: {
      upcoming: artUpcoming,
      past: artPast,
      emptyName: artEmptyName,
    },
  }), [eventName, event.shortName, event.logoSrc, event.artworkTemplate, event.venue, location, dateLabel, displayName, role, socialProfile, currentPhoto, pastEvent, artUpcoming, artPast, artEmptyName, artPoweredBy]);

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

  function handleLanguageChange(value: string) {
    if (value === 'en' || value === 'es') setLocale(value);
  }

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

  async function getArtFile(): Promise<File> {
    const canvas = canvasRef.current;
    if (!canvas || !artReady) throw new Error(t('artNotReady'));
    const blob = await canvasBlob(canvas);
    return new File([blob], `${event.slug}-attending.png`, { type: 'image/png' });
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

  async function downloadArtwork() {
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
    try {
      const file = await getArtFile();
      const navigatorWithShare = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
        share?: (data?: ShareData) => Promise<void>;
      };
      if (navigatorWithShare.share && navigatorWithShare.canShare?.({ files: [file] })) {
        await navigatorWithShare.share({
          files: [file],
          title: `${t('shareTitle')} ${eventName}`,
          text: `${intentionLabel} ${eventName}`,
        });
        return;
      }
      saveFile(file);
      setLastAction('download');
      toast.info(t('shareFallback'));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error(t('shareError'));
    }
  }

  async function copyEventLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLastAction('copy');
      toast.success(t('linkCopied'));
    } catch {
      toast.error(t('copyError'));
    }
  }

  function openSocialShare(network: 'x' | 'linkedin') {
    const text = `${intentionLabel} ${eventName}`;
    const target = network === 'x'
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="https://hashpass.club/" aria-label="HASHPASS Club home">
          <img src="/logo-hashpass.svg" alt="" />
          <span>HASHPASS</span>
        </a>
        <div className={styles.headerActions}>
          <div className={styles.languageControl} aria-label={t('languageLabel')}>
            <SegmentedTabs
              mode={mode}
              value={language}
              onChange={handleLanguageChange}
              tabs={[{ id: 'en', label: 'EN' }, { id: 'es', label: 'ES' }]}
            />
          </div>
          <IconButton
            mode={mode}
            label={isDark ? t('switchLight') : t('switchDark')}
            onPress={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div>
            <p className={styles.eyebrow}><span className={styles.liveDot} />{t('pageEyebrow')}</p>
            <h1>{pastEvent ? t('pastPageTitle') : t('pageTitle')}</h1>
            <p className={styles.lead}>{t('pageDescription')}</p>
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
            <div className={styles.sectionHeading}>
              <span className={styles.stepNumber}>01</span>
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
                  {user && profilePhoto ? <img className={styles.sourceAvatar} src={profilePhoto} alt="" /> : <span className={styles.sourceIcon}><UserRound size={19} /></span>}
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
              <p className={styles.socialNote}>{t('socialConnectionNote')}</p>
            </div>

            <div className={styles.fields}>
              <FormField
                mode={mode}
                label={t('nameLabel')}
                value={name}
                onChangeText={setName}
                placeholder={t('namePlaceholder')}
                maxLength={42}
                accessibilityLabel={t('nameLabel')}
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
              <FormField
                mode={mode}
                label={t('socialHandleLabel')}
                value={socialProfile}
                onChangeText={setSocialProfile}
                placeholder={t('socialHandlePlaceholder')}
                maxLength={120}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('socialHandleLabel')}
              />
            </div>
            <p className={styles.socialNote}>{t('socialHandleHint')}</p>

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
                disabled={!artReady}
                style={{ flex: 1 }}
              />
              <ActionButton
                mode={mode}
                label={t('downloadImage')}
                leadingIcon={<ArrowDownToLine size={17} />}
                variant="secondary"
                onPress={downloadArtwork}
                disabled={!artReady}
                style={{ flex: 1 }}
              />
            </div>

            <div className={styles.socialShare}>
              <span>{t('shareOn')}</span>
              <ActionButton
                mode={mode}
                label="X"
                trailingIcon={<ArrowUpRight size={14} />}
                variant="ghost"
                onPress={() => openSocialShare('x')}
              />
              <ActionButton
                mode={mode}
                label="LinkedIn"
                trailingIcon={<ArrowUpRight size={14} />}
                variant="ghost"
                onPress={() => openSocialShare('linkedin')}
              />
              <ActionButton
                mode={mode}
                label={t('copyPageLink')}
                leadingIcon={lastAction === 'copy' ? <Check size={14} /> : undefined}
                variant="ghost"
                onPress={copyEventLink}
              />
            </div>
            <p className={styles.shareHint}>{t('shareHint')}</p>
              </div>
            </Surface>
          </aside>
        </div>

        <footer className={styles.footer}>
          <span>{t('footerBrand')}</span>
          <span>{t('footerPrivacy')}</span>
        </footer>
      </main>

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
