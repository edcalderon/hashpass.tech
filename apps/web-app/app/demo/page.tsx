'use client';

import { useTranslation } from '@hashpass/i18n';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ScrollToTop } from '../components/ScrollToTop';
import { ShaderBackground } from '../components/ShaderBackground';
import { VideoShowcase } from './VideoShowcase';

function DemoHero() {
  const { t } = useTranslation('demo');

  return (
    <ShaderBackground>
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          padding: '180px 24px 100px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '6px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.9)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.5,
            marginBottom: 24,
          }}
        >
          {t('eyebrow')}
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
            fontWeight: 600,
            color: '#ffffff',
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          {t('title')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 18,
            color: 'rgba(255,255,255,0.78)',
            lineHeight: 1.6,
            maxWidth: 640,
            margin: '0 auto',
          }}
        >
          {t('subtitle')}
        </p>
      </div>
    </ShaderBackground>
  );
}

export default function DemoPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <Navbar />
      <main>
        <DemoHero />
        <div style={{ marginTop: -40, position: 'relative', zIndex: 2 }}>
          <VideoShowcase />
        </div>
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  );
}
