'use client';

import { ArrowLeft, CalendarDays, Lock, Mail, QrCode, ShieldCheck, Users, Globe2 } from 'lucide-react';
import { useTranslation } from '@hashpass/i18n';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { ScrollToTop } from '../components/ScrollToTop';
import styles from './about.module.css';

export function AboutExperience() {
  const { t } = useTranslation('about');

  const build = [
    { icon: Users, title: t('build1Title'), body: t('build1Body') },
    { icon: CalendarDays, title: t('build2Title'), body: t('build2Body') },
    { icon: QrCode, title: t('build3Title'), body: t('build3Body') },
  ];
  const principles = [
    { icon: ShieldCheck, title: t('principle1Title'), body: t('principle1Body') },
    { icon: Lock, title: t('principle2Title'), body: t('principle2Body') },
    { icon: Globe2, title: t('principle3Title'), body: t('principle3Body') },
  ];

  return (
    <div className={styles.page}>
      <Navbar showMarketingLinks={false} hasHero={false} />

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="about-title">
          <p className={styles.eyebrow}><span className={styles.eyebrowMark} />{t('eyebrow')}</p>
          <h1 id="about-title">{t('title')}</h1>
          <p className={styles.lead}>{t('lead')}</p>
        </section>

        <section className={styles.split} aria-labelledby="about-who">
          <div>
            <p className={styles.eyebrow}>{t('whoEyebrow')}</p>
            <h2 id="about-who">{t('whoTitle')}</h2>
          </div>
          <div className={styles.prose}>
            <p>{t('whoBody1')}</p>
            <p>{t('whoBody2')}</p>
          </div>
        </section>

        <section className={styles.mission} aria-labelledby="about-mission">
          <p className={styles.eyebrow}>{t('missionEyebrow')}</p>
          <h2 id="about-mission">{t('missionTitle')}</h2>
          <p>{t('missionBody')}</p>
        </section>

        <section className={styles.section} aria-labelledby="about-build">
          <p className={styles.eyebrow}>{t('buildEyebrow')}</p>
          <h2 id="about-build">{t('buildTitle')}</h2>
          <div className={styles.grid}>
            {build.map(({ icon: Icon, title, body }) => (
              <article className={styles.card} key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="about-principles">
          <p className={styles.eyebrow}>{t('principlesEyebrow')}</p>
          <h2 id="about-principles">{t('principlesTitle')}</h2>
          <div className={styles.grid}>
            {principles.map(({ icon: Icon, title, body }) => (
              <article className={styles.card} key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.contact} aria-labelledby="about-contact">
          <div>
            <h2 id="about-contact">{t('contactTitle')}</h2>
            <p>{t('contactBody')}</p>
          </div>
          <div className={styles.actions}>
            <a className={styles.primary} href={`mailto:${t('email')}`}><Mail size={17} aria-hidden="true" />{t('contactCta')}</a>
            <a className={styles.secondary} href="/"><ArrowLeft size={17} aria-hidden="true" />{t('backHome')}</a>
          </div>
        </section>
      </main>

      <Footer />
      <ScrollToTop />
    </div>
  );
}
