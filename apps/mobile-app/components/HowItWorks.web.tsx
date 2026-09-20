"use client";

import english from '../i18n/locales/en.json';
import { uiTokens, uiPalette } from '@hashpass/ui/tokens';
import LandingBadge from './LandingBadge';
import React, { useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Maximize2 as LucideExpand, Minimize2 as LucideCollapse } from 'lucide';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import HowItWorksIllustration, { type HowItWorksCardId, type HowItWorksSceneLabels } from './HowItWorksIllustration';
import { MorphIcon } from '../lib/morph-icon';
import type { SharedValue } from 'react-native-reanimated';
const cards: { id: HowItWorksCardId; accent: string }[] = [
  { id: 'scan', accent: '#06b6d4' }, { id: 'allies', accent: '#a855f7' },
  { id: 'meet', accent: '#22c55e' }, { id: 'rewards', accent: '#f59e0b' },
];
function Card({ card, index, dark, animate, sectionVisible }: { card: typeof cards[number]; index: number; dark: boolean; animate: boolean; sectionVisible: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const cardVisible = useInView(ref, { amount: 0.22, once: true });
  const visible = sectionVisible && cardVisible;
  const { t } = useTranslation('index');
  const labels: HowItWorksSceneLabels = {
    eventPass: t('howItWorks.scenes.eventPass', 'EVENT PASS'), eventExplorer: t('howItWorks.scenes.eventExplorer', 'EVENT EXPLORER'),
    agenda: t('howItWorks.scenes.agenda', 'AGENDA'), speakers: t('howItWorks.scenes.speakers', 'SPEAKERS'),
    findAttendees: t('howItWorks.scenes.findAttendees', 'FIND ATTENDEES'), meet: t('howItWorks.scenes.meet', 'MEET'),
    lksWallet: t('howItWorks.scenes.lksWallet', '$LKS WALLET'), availableBalance: t('howItWorks.scenes.availableBalance', 'AVAILABLE BALANCE'),
  };
  return <motion.article ref={ref}
    className="hashpass-how-card"
    style={{ background: uiPalette(dark).surface, border: `1px solid ${uiPalette(dark).border}`, borderRadius: uiTokens.radius.card, padding: 'clamp(20px, 2.3vw, 28px)', minWidth: 0, height: 338, boxSizing: 'border-box' }}
    initial={animate ? { opacity: 0, y: 18, scale: 0.99, filter: 'blur(5px)' } : false}
    animate={animate ? (visible ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' } : { opacity: 0, y: 18, scale: 0.99, filter: 'blur(5px)' }) : undefined}
    transition={{ duration: 0.58, delay: 0.08 + (index % 2) * 0.08, ease: [0.22, 1, 0.36, 1] }}
    whileHover={animate ? { scale: 1.006, transition: { duration: 0.18 } } : undefined}>
    <div aria-hidden="true" className="hashpass-how-scene" style={{ height: 136, borderRadius: uiTokens.radius.media, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' }}>
      <HowItWorksIllustration kind={card.id} color={card.accent} animated={animate && visible} labels={labels} />
    </div>
    <div style={{ position: 'relative', display: 'grid', alignItems: 'center', minHeight: 32 }}>
      <h3 style={{ color: uiPalette(dark).text, fontSize: 22, lineHeight: 1.25, fontWeight: 700, letterSpacing: -0.5, margin: 0, textAlign: 'center' }}>{t(`howItWorks.cards.${card.id}.title`, english.index.howItWorks.cards[card.id].title)}</h3>
      <button type="button" className="hashpass-how-info" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-label={expanded ? t('howItWorks.closeInfo', 'Collapse details') : t('howItWorks.moreInfo', 'Expand details')} style={{ position: 'absolute', right: 0, width: 28, height: 28, padding: 0, borderRadius: uiTokens.radius.circle, border: `1px solid ${uiPalette(dark).border}`, background: 'transparent', color: uiPalette(dark).muted, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <MorphIcon icon={expanded ? LucideCollapse : LucideExpand} size={16} color={uiPalette(dark).muted} strokeWidth={1.8} spring="snappy" fallbackIconName={expanded ? 'contract-outline' : 'expand-outline'} />
        <span role="tooltip" className="hashpass-how-tooltip">{expanded ? t('howItWorks.closeInfo', 'Collapse details') : t('howItWorks.moreInfo', 'Expand details')}</span>
      </button>
    </div>
    <div style={{ minHeight: 104, paddingTop: 16 }}>{expanded ? <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ padding: '12px 14px', borderRadius: uiTokens.radius.media, background: uiPalette(dark).raised }}><p style={{ color: uiPalette(dark).muted, fontSize: 16, lineHeight: 1.6, margin: 0, textAlign: 'center' }}>{t(`howItWorks.cards.${card.id}.description`, english.index.howItWorks.cards[card.id].description)}</p></motion.div> : null}</div>
  </motion.article>;
}
export default function HowItWorks(_props: { scrollY?: SharedValue<number> }) {
  const { isDark } = useTheme(); const { t } = useTranslation('index');
  const { animationLevel } = useAnimationLevel(); const reduced = useReducedMotion();
  const animate = animationLevel === 'full' && !reduced;
  const sectionRef = useRef<HTMLElement>(null);
  const visible = useInView(sectionRef, { amount: 0.12, once: true });
  return <section ref={sectionRef} aria-labelledby="how-it-works-title" style={{ padding: '64px 20px', width: '100%', boxSizing: 'border-box' }}>
    <style>{`.hashpass-how-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;max-width:1340px;margin:0 auto}.hashpass-how-scene{background:transparent}.hashpass-how-info .hashpass-how-tooltip{position:absolute;right:0;top:calc(100% + 8px);z-index:2;width:max-content;max-width:180px;padding:6px 8px;border-radius:6px;background:${uiPalette(isDark).raised};border:1px solid ${uiPalette(isDark).border};color:${uiPalette(isDark).text};font-size:12px;line-height:16px;opacity:0;pointer-events:none;transform:translateY(-3px);transition:opacity .16s,transform .16s}.hashpass-how-info:hover .hashpass-how-tooltip,.hashpass-how-info:focus-visible .hashpass-how-tooltip{opacity:1;transform:translateY(0)}@media(max-width:600px){.hashpass-how-grid{grid-template-columns:minmax(0,1fr);gap:16px}.hashpass-how-card{height:338px!important}}`}</style>
    <motion.div initial={animate ? { opacity: 0, y: 28, filter: 'blur(7px)' } : false}
      animate={animate ? (visible ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 28, filter: 'blur(7px)' }) : undefined}
      transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: '0 auto 40px', maxWidth: 760 }}>
      <LandingBadge>{t('howItWorks.badge', 'How it works')}</LandingBadge>
      <h2 id="how-it-works-title" style={{ color: uiPalette(isDark).text, fontSize: 'clamp(28px,4vw,42px)', lineHeight: 1.15, letterSpacing: -1, fontWeight: 750, margin: '16px 0' }}>{t('howItWorks.title', 'How HASHPASS Works')}</h2>
      <p style={{ color: uiPalette(isDark).muted, fontSize: 17, lineHeight: 1.6, margin: 0 }}>{t('howItWorks.subtitle', 'One pass, one login, every event — built for speed and privacy.')}</p>
    </div>
    <div className="hashpass-how-grid">{cards.map((card, index) => <Card key={card.id} card={card} index={index} dark={isDark} animate={animate} sectionVisible={visible} />)}</div>
    </motion.div>
  </section>;
}
