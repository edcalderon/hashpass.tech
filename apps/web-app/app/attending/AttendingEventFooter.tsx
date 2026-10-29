'use client';

import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from '@hashpass/i18n';
import { useTheme } from '../components/ThemeProvider';
import type { AttendingEventFooterProps } from './types/attending.types';
import styles from './event-footer.module.css';

export function AttendingEventFooter({ event, returnHref }: AttendingEventFooterProps) {
  const { t } = useTranslation('attending');
  const { t: tFooter } = useTranslation('footer');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brands}>
          <a className={styles.eventBrand} href={returnHref} aria-label={`${event.name} · ${t('landingEventsTitle')}`}>
            <span className={styles.logoFrame}>
              <img src={event.logoSrc} alt="" />
            </span>
            <span className={styles.eventCopy}>
              <strong>{event.name}</strong>
              <span>{event.shortName} · {t('footerBrand')}</span>
            </span>
          </a>
          <a className={styles.poweredBy} href="https://hashpass.tech/" aria-label="HASHPASS">
            <span>{t('poweredBy')}</span>
            <img
              src={isDark ? '/logo-full-hashpass-white-cyan.svg' : '/logo-full-hashpass-black-cyan.svg'}
              alt="HASHPASS"
            />
          </a>
        </div>

        <nav className={styles.links} aria-label={`${event.name} · ${tFooter('legal')}`}>
          <a href={returnHref}>{t('landingEventsTitle')}</a>
          {event.website && (
            <a href={event.website} target="_blank" rel="noopener noreferrer">
              {t('eventWebsite')} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          <a href="https://hashpass.club/documentation/legal/privacy-policy/">{tFooter('privacy')}</a>
          <a href="https://hashpass.club/documentation/legal/terms-of-service/">{tFooter('terms')}</a>
        </nav>
      </div>
    </footer>
  );
}
