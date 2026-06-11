'use client';

import { useTranslation } from '@hashpass/i18n';

export function CTASection() {
  const { t } = useTranslation('cta');

  return (
    <section
      style={{
        padding: 'clamp(64px, 10vw, 120px) 24px',
        background: 'var(--bg-canvas-alt)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          maxWidth: 740,
          margin: '0 auto',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t('eyebrow')}
        </span>
        <h2
          style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.05,
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {t('title')}
        </h2>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            maxWidth: 520,
            margin: 0,
          }}
        >
          {t('subtitle')}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <a
            href={`mailto:${t('email')}`}
            style={{
              padding: '14px 32px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: -0.2,
              transition: 'opacity 0.2s, transform 0.15s',
              boxShadow: '0 4px 20px var(--accent-glow)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.88';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            {t('primary')}
          </a>
          <a
            href="/documentation/"
            style={{
              padding: '14px 32px',
              borderRadius: 12,
              border: '1px solid var(--border-strong)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: -0.2,
              transition: 'border-color 0.2s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            {t('secondary')}
          </a>
        </div>
      </div>
    </section>
  );
}
