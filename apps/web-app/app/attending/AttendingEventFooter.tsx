'use client';

import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from '@hashpass/i18n';
import type { AttendingEventFooterProps } from './types/attending.types';
import styles from './event-footer.module.css';

export function AttendingEventFooter({ event, returnHref }: AttendingEventFooterProps) {
  const { t } = useTranslation('attending');

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <a className={styles.eventBrand} href={returnHref} aria-label={`${event.name} · ${t('landingEventsTitle')}`}>
          <span className={styles.logoFrame}>
            <img src={event.logoSrc} alt="" />
          </span>
          <span className={styles.eventCopy}>
            <strong>{event.name}</strong>
            <span>{event.shortName} · {t('footerBrand')}</span>
          </span>
        </a>

        <nav className={styles.links} aria-label={event.name}>
          <a href={returnHref}>{t('landingEventsTitle')}</a>
          {event.website && (
            <a href={event.website} target="_blank" rel="noopener noreferrer">
              {t('eventWebsite')} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
