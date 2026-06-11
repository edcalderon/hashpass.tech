'use client';

import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ScrollToTop } from './components/ScrollToTop';
import { Footer } from './components/Footer';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <Navbar />
      <main>
        <HeroSection />
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  );
}
