'use client';

import { useRef } from 'react';
import { useLocale, useTranslation } from '@hashpass/i18n';
import { Badge, IconButton, Surface } from '@hashpass/ui/primitives';
import { ArrowDownRight, ArrowLeft, ArrowRight, CalendarDays, Check, Image, MapPin, Share2, ShieldCheck } from 'lucide-react';
import type { AttendingLandingProps, AttendingLandingStepProps } from './types/attending.types';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { useTheme } from '../components/ThemeProvider';
import { formatAttendingEventDate } from '../../lib/attending-date';
import {
  getAttendingEventHref,
  getAttendingLandingBrandUrl,
  getGenericAttendingHref,
} from '../../lib/attending-url';
import styles from './landing.module.css';

export function AttendingLandingExperience({
  events,
  showCustomEventCard = true,
  brandHref = getAttendingLandingBrandUrl(),
}: AttendingLandingProps) {
  const { t } = useTranslation('attending');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const mode = resolvedTheme;

  function scrollEvents(direction: -1 | 1) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    carousel.scrollBy({ left: direction * Math.max(carousel.clientWidth * 0.82, 280), behavior });
  }

  return (
    <div className={styles.page}>
      <Navbar showMarketingLinks={false} brandHref={brandHref} />

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
            {events.length > 0 && (
              <div className={styles.carouselControls}>
                <IconButton mode={mode} label={t('landingPreviousEvents')} onPress={() => scrollEvents(-1)}><ArrowLeft size={18} /></IconButton>
                <IconButton mode={mode} label={t('landingNextEvents')} onPress={() => scrollEvents(1)}><ArrowRight size={18} /></IconButton>
              </div>
            )}
          </div>

          {!events.length && <p className={styles.emptyEvents}>{t('landingNoUpcoming')}</p>}
          <div className={styles.carousel} role="region" aria-roledescription="carousel" aria-label={t('landingCarouselLabel')}>
            <div className={styles.carouselTrack} ref={carouselRef}>
              {events.map((event) => {
                const eventDate = formatAttendingEventDate(event, locale);
                return (
                  <article className={styles.eventSlide} key={event.slug}>
                    <Surface mode={mode} style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
                      <a className={styles.eventLink} href={getAttendingEventHref(event.slug)}>
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
                            {eventDate && <span><CalendarDays size={15} />{eventDate}</span>}
                            {event.city && <span><MapPin size={15} />{[event.city, event.country].filter(Boolean).join(', ')}</span>}
                          </div>
                          <span className={styles.eventCta}>{t('landingCreateArtwork')} <ArrowRight size={17} /></span>
                        </div>
                      </a>
                    </Surface>
                  </article>
                );
              })}
              {showCustomEventCard && (
                <article className={styles.eventSlide} key="bring-your-event">
                  <Surface mode={mode} style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
                    <a className={styles.eventLink} href={getGenericAttendingHref()}>
                      <div className={`${styles.eventArtwork} ${styles.customEventArtwork}`}>
                        <div className={styles.artworkGrid} />
                        <span className={styles.eventBadge}><Badge mode="dark" tone="onMedia" compact>{t('customEventCardEyebrow')}</Badge></span>
                        <div className={styles.customEventMark} aria-hidden="true"><CalendarDays size={42} /><span>+</span></div>
                        <span className={styles.artworkCode}>HASHPASS CLUB / OPEN</span>
                      </div>
                      <div className={styles.eventInfo}>
                        <div className={styles.eventKicker}>{t('customEventCardKicker')}</div>
                        <h3>{t('customEventCardTitle')}</h3>
                        <p className={styles.customEventDescription}>{t('customEventCardDescription')}</p>
                        <span className={styles.eventCta}>{t('customEventCardCta')} <ArrowRight size={17} /></span>
                      </div>
                    </a>
                  </Surface>
                </article>
              )}
            </div>
            {events.length > 0 && <p className={styles.scrollHint}>{t('landingScrollHint')}</p>}
          </div>
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

      <Footer />
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
