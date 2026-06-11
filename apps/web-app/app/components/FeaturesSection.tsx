'use client';

import { useTranslation } from '@hashpass/i18n';

const featureIcons: Record<string, string> = {
  identity: '🪪',
  billing: '💳',
  access: '⚡',
  operations: '📊',
  multiplatform: '📱',
  blockchain: '🔗',
};

const featureAccents: Record<string, string> = {
  identity: '#8b5cf6',
  billing: '#d6a55c',
  access: '#56d49f',
  operations: '#86b6ff',
  multiplatform: '#ec4899',
  blockchain: '#f59e0b',
};

export function FeaturesSection() {
  const { t } = useTranslation('features');

  const features = ['identity', 'billing', 'access', 'operations', 'multiplatform', 'blockchain'] as const;

  return (
    <section id="features" style={{ padding: 'clamp(64px, 10vw, 120px) 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ maxWidth: 640, marginBottom: 'clamp(40px, 6vw, 72px)' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              marginBottom: 16,
            }}
          >
            {t('eyebrow')}
          </span>
          <h2
            style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1.1,
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
              margin: '0 0 16px',
            }}
          >
            {t('title')}
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
            {t('subtitle')}
          </p>
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 1,
            background: 'var(--border)',
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          {features.map((key) => (
            <div
              key={key}
              style={{
                background: 'var(--bg-surface)',
                padding: '32px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'background 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-raised)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${featureAccents[key]}18`,
                  border: `1px solid ${featureAccents[key]}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                {featureIcons[key]}
              </div>
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: '0 0 8px',
                    letterSpacing: -0.3,
                  }}
                >
                  {t(`${key}.title`)}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                    margin: 0,
                  }}
                >
                  {t(`${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
