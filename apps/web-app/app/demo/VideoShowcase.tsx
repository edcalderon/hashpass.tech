'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '@hashpass/i18n';
import { bslShowcase, chaptersEn, chaptersEs, videoSources, type VideoLocale } from './chapters';

type Tab = 'tutorial' | 'bsl';

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5v14l11-7-11-7Z" fill="currentColor" />
    </svg>
  );
}

export function VideoShowcase() {
  const { t } = useTranslation('demo');
  const [tab, setTab] = useState<Tab>('tutorial');
  const [locale, setLocale] = useState<VideoLocale>('en');
  const [narrated, setNarrated] = useState(true);
  const [activeChapter, setActiveChapter] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const chapters = locale === 'en' ? chaptersEn : chaptersEs;
  const source = videoSources[locale];
  const videoSrc = narrated ? source.narrated : source.silent;

  const seekTo = (seconds: number, index: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play();
    setActiveChapter(index);
  };

  const onTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;
    let current = 0;
    for (let i = 0; i < chapters.length; i += 1) {
      if (el.currentTime >= chapters[i].startSeconds) current = i;
    }
    setActiveChapter(current);
  };

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 22px',
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#ffffff' : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  });

  const toggleButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  });

  return (
    <section
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '0 24px 120px',
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
        <button style={tabButtonStyle(tab === 'tutorial')} onClick={() => setTab('tutorial')}>
          {t('appTutorialTitle')}
        </button>
        <button style={tabButtonStyle(tab === 'bsl')} onClick={() => setTab('bsl')}>
          {t('bslShowcaseTitle')}
        </button>
      </div>

      {tab === 'tutorial' ? (
        <div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={toggleButtonStyle(locale === 'en')} onClick={() => setLocale('en')}>
                English
              </button>
              <button style={toggleButtonStyle(locale === 'es')} onClick={() => setLocale('es')}>
                Español
              </button>
            </div>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={toggleButtonStyle(narrated)} onClick={() => setNarrated(true)}>
                {t('withNarration')}
              </button>
              <button style={toggleButtonStyle(!narrated)} onClick={() => setNarrated(false)}>
                {t('silent')}
              </button>
            </div>
          </div>

          <VideoFrame>
            <video
              key={videoSrc}
              ref={videoRef}
              src={videoSrc}
              poster={source.poster}
              controls
              playsInline
              onTimeUpdate={onTimeUpdate}
              style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
            />
          </VideoFrame>

          <p
            style={{
              textAlign: 'center',
              marginTop: 16,
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}
          >
            {t('appTutorialSubtitle')}
          </p>

          <ChapterList
            chapters={chapters}
            activeChapter={activeChapter}
            onSelect={seekTo}
            heading={t('chapters')}
            translate={t}
          />
        </div>
      ) : (
        <div>
          <VideoFrame>
            <video
              src={bslShowcase.src}
              poster={bslShowcase.poster}
              controls
              playsInline
              style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
            />
          </VideoFrame>
          <p
            style={{
              textAlign: 'center',
              marginTop: 16,
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}
          >
            {t('bslShowcaseSubtitle')}
          </p>
        </div>
      )}
    </section>
  );
}

function VideoFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        aspectRatio: '16 / 9',
        background: '#000',
      }}
    >
      {children}
    </div>
  );
}

function ChapterList({
  chapters,
  activeChapter,
  onSelect,
  heading,
  translate,
}: {
  chapters: {slug: string; titleKey: string; startSeconds: number}[];
  activeChapter: number;
  onSelect: (seconds: number, index: number) => void;
  heading: string;
  translate: (key: string) => string;
}) {
  return (
    <div style={{ marginTop: 40 }}>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          marginBottom: 14,
        }}
      >
        {heading}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {chapters.map((chapter, index) => {
          const active = index === activeChapter;
          return (
            <button
              key={chapter.slug}
              onClick={() => onSelect(chapter.startSeconds, index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 12,
                textAlign: 'left',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                color: active ? 'var(--accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ opacity: active ? 1 : 0.5, display: 'flex' }}>
                <PlayIcon />
              </span>
              {translate(chapter.titleKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
