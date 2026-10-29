'use client';

import { useEffect, useId, useRef } from 'react';
import QRCode from 'react-qr-code';
import { useTranslation } from '@hashpass/i18n';
import { Surface } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import type { PricingDialogProps } from './types/PricingDialog.types';
import { useTheme } from './ThemeProvider';
import styles from './PricingDialog.module.css';

export function PricingDialog({ open, onClose }: PricingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const id = useId().replace(/:/g, '');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const { t } = useTranslation('footer');
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
      closeButtonRef.current?.focus();
      return () => {
        if (dialog.open) dialog.close();
      };
    }

    if (dialog.open) dialog.close();
  }, [open]);

  const products = [
    {
      title: t('pricingDialog.companionTitle'),
      badge: t('pricingDialog.companionBadge'),
      description: t('pricingDialog.companionDescription'),
      linkLabel: t('pricingDialog.companionLink'),
      href: 'https://companion-dev.hashpass.tech',
      external: true,
      visual: 'companion',
      visualClass: styles.companionVisual,
    },
    {
      title: t('pricingDialog.qrTitle'),
      badge: t('pricingDialog.qrBadge'),
      description: t('pricingDialog.qrDescription'),
      linkLabel: t('pricingDialog.qrLink'),
      href: '/qr',
      external: false,
      visual: 'qr',
      visualClass: styles.qrVisual,
    },
    {
      title: t('pricingDialog.hashpassTitle'),
      badge: t('pricingDialog.hashpassBadge'),
      description: t('pricingDialog.hashpassDescription'),
      linkLabel: t('pricingDialog.hashpassLink'),
      href: '/documentation/',
      external: false,
      visual: 'hashpass',
      visualClass: styles.hashpassVisual,
    },
  ];

  return (
    <dialog
      ref={dialogRef}
      id={`${id}-dialog`}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className={styles.panel}>
        <Surface
          mode={mode}
          style={{
            width: '100%',
            borderRadius: uiTokens.radius.card,
            padding: 0,
          }}
        >
          <div className={styles.content}>
            <div className={styles.headingRow}>
              <div>
                <p className={styles.eyebrow}>{t('pricingDialog.eyebrow')}</p>
                <h2 id={titleId} className={styles.title}>
                  {t('pricingDialog.title')}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                className={styles.closeButton}
                type="button"
                aria-label={t('pricingDialog.close')}
                onClick={() => dialogRef.current?.close()}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <p id={descriptionId} className={styles.description}>
              {t('pricingDialog.description')}
            </p>

            <div className={styles.freeTier}>
              <span className={styles.freeTierMark} aria-hidden="true">✓</span>
              <div>
                <strong>{t('pricingDialog.freeTierTitle')}</strong>
                <p>{t('pricingDialog.freeTierDescription')}</p>
              </div>
            </div>

            <h3 className={styles.productsHeading}>{t('pricingDialog.productsHeading')}</h3>
            <div className={styles.productGrid}>
              {products.map((product) => (
                <article className={styles.productCard} key={product.title}>
                  <div className={`${styles.productVisual} ${product.visualClass}`} aria-hidden="true">
                    {product.visual === 'qr' ? (
                      <div className={styles.qrArtwork}>
                        <QRCode value="https://hashpass.club/qr" size={104} bgColor="#FFFFFF" fgColor="#0D1728" />
                      </div>
                    ) : (
                      <img
                        src={product.visual === 'companion' ? '/pricing/companion-preview.svg' : '/pricing/hashpass-platform.svg'}
                        alt=""
                        loading="eager"
                      />
                    )}
                    <span className={styles.productBadge}>{product.badge}</span>
                  </div>
                  <h4>{product.title}</h4>
                  <p>{product.description}</p>
                  <a
                    href={product.href}
                    {...(product.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {product.linkLabel}<span aria-hidden="true"> ↗</span>
                  </a>
                </article>
              ))}
            </div>

            <div className={styles.termsRow}>
              <p>{t('pricingDialog.termsNote')}</p>
              <a href="/documentation/legal/terms-of-service/">
                {t('pricingDialog.termsLink')}<span aria-hidden="true"> ↗</span>
              </a>
            </div>
          </div>
        </Surface>
      </div>
    </dialog>
  );
}
