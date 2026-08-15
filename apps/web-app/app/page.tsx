'use client';

import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { LandingAnimationProvider } from './components/LandingAnimationProvider';
import { ScrollToTop } from './components/ScrollToTop';
import { Footer } from './components/Footer';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
      <LandingAnimationProvider>
        <Navbar />
        <main style={{ flex: '1 0 auto' }}>
          <HeroSection />
        </main>
      </LandingAnimationProvider>
      <Footer />
      <ScrollToTop />
    </div>
  );
}
