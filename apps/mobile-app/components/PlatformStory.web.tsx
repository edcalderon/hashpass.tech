import React from 'react';
import LandingBadge from './LandingBadge';
import { LazyMotion, domAnimation, m } from 'motion/react';
import PlatformStoryCards from './PlatformStoryCards';
import { platformStoryCards } from './platformStoryCards';
import { useTranslation } from '../i18n/i18n';
import { useTheme } from '../hooks/useTheme';

const PlatformStory: React.FC = () => {
  const { t } = useTranslation('index.platformStory');
  const { colors } = useTheme();
  const stories = platformStoryCards.map((card) => ({
    ...card,
    metricValue: t(`cards.${card.id}.metricValue`),
    metric: t(`cards.${card.id}.metric`),
    eyebrow: t(`cards.${card.id}.eyebrow`),
    title: t(`cards.${card.id}.title`),
    description: t(`cards.${card.id}.description`),
  }));

  return (
    <section
      aria-labelledby="platform-story-title"
      className="bg-background relative"
    >
      <div className="container z-10 mx-auto">
        <LazyMotion features={domAnimation}>
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once: true }}
            className="mx-auto flex max-w-[540px] flex-col items-center justify-center text-center"
          >
            <LandingBadge>{t('eyebrow')}</LandingBadge>
            <h2
              id="platform-story-title"
              className="mt-5 text-xl font-bold tracking-tighter sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl"
              style={{ color: colors.text.primary }}
            >
              {t('title')}
            </h2>
            <p
              className="mt-5 text-center opacity-75"
              style={{ color: colors.text.secondary }}
            >
              {t('description')}
            </p>
          </m.div>
        </LazyMotion>
        <PlatformStoryCards stories={stories} />
      </div>
    </section>
  );
};

export default PlatformStory;
