"use client";

import english from '../i18n/locales/en.json';
import { uiTokens, uiPalette } from '@hashpass/ui/tokens';
import LandingBadge from './LandingBadge';
import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import HowItWorksIllustration, { type HowItWorksCardId } from './HowItWorksIllustration';
import type { SharedValue } from 'react-native-reanimated';
const cards: { id: HowItWorksCardId; accent: string }[] = [
  { id: 'scan', accent: '#06b6d4' }, { id: 'allies', accent: '#a855f7' },
  { id: 'meet', accent: '#22c55e' }, { id: 'rewards', accent: '#f59e0b' },
];
function Card({ card, index, dark, animate }: { card: typeof cards[number]; index: number; dark: boolean; animate: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref, { amount: 0.15 });
  const { t } = useTranslation('index');
  return <motion.article ref={ref}
    className="hashpass-how-card"
    style={{ background: uiPalette(dark).surface, border: `1px solid ${uiPalette(dark).border}`, borderRadius: uiTokens.radius.card, padding: 'clamp(20px, 2.3vw, 28px)', minWidth: 0 }}
    initial={animate ? { opacity: 0.72, y: 22, scale: 0.985, filter: 'blur(5px)' } : false}
    whileInView={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: 0.65, delay: index % 3 * 0.08, ease: [0.22, 1, 0.36, 1] }}
    whileHover={animate ? { scale: 1.006, transition: { duration: 0.18 } } : undefined}>
    <div aria-hidden="true" style={{ height: 152, borderRadius: uiTokens.radius.media, background: `${card.accent}${dark ? '12' : '0d'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, overflow: 'hidden' }}>
      <HowItWorksIllustration kind={card.id} color={card.accent} animated={animate && visible} />
    </div>
    <h3 style={{ color: uiPalette(dark).text, fontSize: 22, lineHeight: 1.25, fontWeight: 700, letterSpacing: -0.5, margin: '0 0 12px' }}>{t(`howItWorks.cards.${card.id}.title`, english.index.howItWorks.cards[card.id].title)}</h3>
    <p style={{ color: uiPalette(dark).muted, fontSize: 16, lineHeight: 1.6, margin: 0 }}>{t(`howItWorks.cards.${card.id}.description`, english.index.howItWorks.cards[card.id].description)}</p>
  </motion.article>;
}
export default function HowItWorks(_props: { scrollY?: SharedValue<number> }) {
  const { isDark } = useTheme(); const { t } = useTranslation('index');
  const { animationLevel } = useAnimationLevel(); const reduced = useReducedMotion();
  const animate = animationLevel === 'full' && !reduced;
  return <section aria-labelledby="how-it-works-title" style={{ padding: '64px 20px', width: '100%', boxSizing: 'border-box' }}>
    <style>{`.hashpass-how-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;max-width:1340px;margin:0 auto}.hashpass-how-card:last-child{grid-column:1/-1;width:min(100%,640px);justify-self:center;box-sizing:border-box}@media(max-width:1000px){.hashpass-how-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hashpass-how-card:last-child{grid-column:auto;width:auto}}@media(max-width:600px){.hashpass-how-grid{grid-template-columns:minmax(0,1fr);gap:16px}.hashpass-how-card:last-child{width:100%}}`}</style>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: '0 auto 40px', maxWidth: 760 }}>
      <LandingBadge>{t('howItWorks.badge', 'How it works')}</LandingBadge>
      <h2 id="how-it-works-title" style={{ color: uiPalette(isDark).text, fontSize: 'clamp(28px,4vw,42px)', lineHeight: 1.15, letterSpacing: -1, fontWeight: 750, margin: '16px 0' }}>{t('howItWorks.title', 'How HASHPASS Works')}</h2>
      <p style={{ color: uiPalette(isDark).muted, fontSize: 17, lineHeight: 1.6, margin: 0 }}>{t('howItWorks.subtitle', 'One pass, one login, every event — built for speed and privacy.')}</p>
    </div>
    <div className="hashpass-how-grid">{cards.map((card, index) => <Card key={card.id} card={card} index={index} dark={isDark} animate={animate} />)}</div>
  </section>;
}
