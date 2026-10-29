'use client';

import { useRef } from 'react';
import { useLocale, useSetLocale, useTranslation } from '@hashpass/i18n';
import { Badge, IconButton, SegmentedTabs, Surface } from '@hashpass/ui/primitives';
import { ArrowDownRight, ArrowLeft, ArrowRight, CalendarDays, Check, Image, MapPin, Moon, Share2, ShieldCheck, Sun } from 'lucide-react';
import type { AttendingEventData, AttendingLandingProps, AttendingLandingStepProps, AttendingLocale } from './types/attending.types';
import { useTheme } from '../components/ThemeProvider';
import styles from './landing.module.css';

function formatDatePart(dateValue: string, locale: AttendingLocale, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-CO' : 'en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatEventDate(event: AttendingEventData, locale: AttendingLocale): string {
  if (!event.startDate) return event.dateFallback || '';

  const fallbackRange = event.dateFallback?.match(/[A-Za-z]+\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})/);
  const startDay = fallbackRange?.[1] || formatDatePart(event.startDate, locale, { day: 'numeric' });
  const endDay = fallbackRange?.[2];
  const month = formatDatePart(event.startDate, locale, { month: 'short' });
  const year = fallbackRange?.[3] || formatDatePart(event.startDate, locale, { year: 'numeric' });

  if (endDay) {
    return locale === 'es' ? `${startDay}–${endDay} ${month} ${year}` : `${month} ${startDay}–${endDay}, ${year}`;
  }
  if (!event.endDate || event.endDate.slice(0, 10) === event.startDate.slice(0, 10)) {
    return `${month} ${startDay}, ${year}`;
  }
  const end = formatDatePart(event.endDate, locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${month} ${startDay} – ${end}`;
}

export function AttendingLandingExperience({ events }: AttendingLandingProps) {
  const { t } = useTranslation('attending');
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const language: AttendingLocale = locale === 'es' ? 'es' : 'en';
  const mode = resolvedTheme;
  const isDark = resolvedTheme === 'dark';

  function scrollEvents(direction: -1 | 1) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    carousel.scrollBy({ left: direction * Math.max(carousel.clientWidth * 0.82, 280), behavior });
  }

  function handleLanguageChange(value: string) {
    if (value === 'en' || value === 'es') setLocale(value);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="https://hashpass.club/" aria-label="HASHPASS Club home">
          <img src="/logo-hashpass.svg" alt="" />
          <span>HASHPASS <b>CLUB</b></span>
        </a>
        <div className={styles.headerActions}>
          <div className={styles.languageControl} aria-label={t('languageLabel')}>
            <SegmentedTabs mode={mode} value={language} onChange={handleLanguageChange} tabs={[{ id: 'en', label: 'EN' }, { id: 'es', label: 'ES' }]} />
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
        <section className={styles.hero} aria-labelledby="attending-landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.eyebrowMark} />{t('landingEyebrow')}</p>
            <h1 id="attending-landing-title">{t('landingTitle')}</h1>
            <p className={styles.heroDescription}>{t('landingDescription')}</p>
            <a className={styles.heroLink} href="#events">{t('landingEventsEyebrow')} <ArrowDownRight size={17} /></a>
          </div>

          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroOrb} />
            <div className={styles.heroArtwork}>
              <div className={styles.heroArtworkTop}>
                <span>{t('landingCardEyebrow')}</span>
                <span className={styles.heroSignal}><i /></span>
              </div>
              <div className={styles.heroArtworkContent}>
                <span className={styles.heroArtworkLabel}>{t('landingCardMade')}</span>
                <strong>{t('landingCardTitle')}</strong>
                <div className={styles.heroArtworkLine} />
                <span className={styles.heroArtworkNote}>{t('landingCardNote')}</span>
              </div>
              <div className={styles.heroArtworkFooter}><span>HASHPASS CLUB</span><span>{t('landingCardEdition')}</span></div>
            </div>
            <div className={styles.heroTag}><ShieldCheck size={15} /> {t('landingNoRsvpTag')}</div>
          </div>
        </section>

        <section className={styles.eventsSection} id="events" aria-labelledby="attending-events-title">
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.sectionEyebrow}>{t('landingEventsEyebrow')}</p>
              <h2 id="attending-events-title">{t('landingEventsTitle')}</h2>
              <p className={styles.sectionDescription}>{t('landingEventsDescription')}</p>
            </div>
            {events.length > 1 && (
              <div className={styles.carouselControls}>
                <IconButton mode={mode} label={t('landingPreviousEvents')} onPress={() => scrollEvents(-1)}><ArrowLeft size={18} /></IconButton>
                <IconButton mode={mode} label={t('landingNextEvents')} onPress={() => scrollEvents(1)}><ArrowRight size={18} /></IconButton>
              </div>
            )}
          </div>

          {events.length ? (
            <div className={styles.carousel} role="region" aria-roledescription="carousel" aria-label={t('landingCarouselLabel')}>
              <div className={styles.carouselTrack} ref={carouselRef}>
                {events.map((event) => (
                  <article className={styles.eventSlide} key={event.slug}>
                    <Surface mode={mode} style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
                      <a className={styles.eventLink} href={`/${event.slug}/`}>
                        <div className={styles.eventArtwork} style={{ background: `radial-gradient(circle at 84% 18%, ${event.color}70, transparent 42%), linear-gradient(138deg, #071321 8%, #102c3d 100%)` }}>
                          <div className={styles.artworkGrid} />
                          <span className={styles.eventBadge}><Badge mode="dark" tone="onMedia" compact>{t('landingUpcoming')}</Badge></span>
                          <img src={event.logoSrc} alt="" aria-hidden="true" />
                          <span className={styles.artworkCode}>{event.shortName} / 2026</span>
                        </div>
                        <div className={styles.eventInfo}>
                          <div className={styles.eventKicker}>{event.shortName}<span>·</span>{event.city}</div>
                          <h3>{event.name}</h3>
                          <div className={styles.eventMeta}>
                            {formatEventDate(event, language) && <span><CalendarDays size={15} />{formatEventDate(event, language)}</span>}
                            {event.city && <span><MapPin size={15} />{[event.city, event.country].filter(Boolean).join(', ')}</span>}
                          </div>
                          <span className={styles.eventCta}>{t('landingCreateArtwork')} <ArrowRight size={17} /></span>
                        </div>
                      </a>
                    </Surface>
                  </article>
                ))}
              </div>
              {events.length > 1 && <p className={styles.scrollHint}>{t('landingScrollHint')}</p>}
            </div>
          ) : (
            <Surface mode={mode} style={{ padding: 24 }}><p className={styles.emptyEvents}>{t('landingNoUpcoming')}</p></Surface>
          )}
        </section>

        <section className={styles.howSection} aria-labelledby="attending-how-title">
          <div className={styles.howIntro}>
            <p className={styles.sectionEyebrow}>{t('landingHowEyebrow')}</p>
            <h2 id="attending-how-title">{t('landingHowTitle')}</h2>
            <p>{t('landingPrivacy')}</p>
          </div>
          <div className={styles.steps}>
            <Step icon={<CalendarDays size={20} />} number="01" title={t('landingStepOneTitle')} body={t('landingStepOneBody')} />
            <Step icon={<Image size={20} />} number="02" title={t('landingStepTwoTitle')} body={t('landingStepTwoBody')} />
            <Step icon={<Share2 size={20} />} number="03" title={t('landingStepThreeTitle')} body={t('landingStepThreeBody')} />
          </div>
        </section>

        <section className={styles.disclaimer} aria-labelledby="attending-disclaimer-title">
          <span className={styles.disclaimerIcon}><Check size={17} /></span>
          <div>
            <h2 id="attending-disclaimer-title">{t('landingDisclaimerTitle')}</h2>
            <p>{t('landingDisclaimerBody')}</p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>{t('footerBrand')}</span>
        <a href="https://hashpass.club/">HASHPASS Club</a>
        <span>{t('landingPrivacy')}</span>
      </footer>
    </div>
  );
}

function Step({ icon, number, title, body }: AttendingLandingStepProps) {
  return (
    <article className={styles.step}>
      <div className={styles.stepTop}><span className={styles.stepIcon}>{icon}</span><span>{number}</span></div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
