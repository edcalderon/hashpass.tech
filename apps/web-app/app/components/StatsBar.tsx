'use client';

import { useTranslation } from '@hashpass/i18n';

export function StatsBar() {
  const { t } = useTranslation('stats');

  const stats = [
    { labelKey: 'activeMembers', valueKey: 'activeMembersValue', accent: '#8b5cf6' },
    { labelKey: 'uptime', valueKey: 'uptimeValue', accent: '#56d49f' },
    { labelKey: 'syncTime', valueKey: 'syncTimeValue', accent: '#86b6ff' },
    { labelKey: 'clubs', valueKey: 'clubsValue', accent: '#d6a55c' },
  ] as const;

  return (
    <section
      style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '0 24px',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        }}
      >
        {stats.map(({ labelKey, valueKey, accent }, i) => (
          <div
            key={labelKey}
            style={{
              padding: '28px 24px',
              borderRight: i < stats.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 'clamp(28px, 4vw, 38px)',
                fontWeight: 700,
                letterSpacing: -1,
                fontFamily: 'var(--font-display)',
                color: accent,
                lineHeight: 1,
              }}
            >
              {t(valueKey)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 500 }}>
              {t(labelKey)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
