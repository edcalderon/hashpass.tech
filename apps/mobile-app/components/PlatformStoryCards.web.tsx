"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { Surface } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import FeatureIcon from './FeatureIcon';
import { useTheme } from '../hooks/useTheme';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import type { PlatformStoryCard } from './types/PlatformStory.types';

function useStreamMotion(ref: React.RefObject<HTMLDivElement | null>) {
  const { animationLevel } = useAnimationLevel();
  const [systemAllowsMotion, setSystemAllowsMotion] = useState(false);
  const [inView, setInView] = useState(false);
  const [foreground, setForeground] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setSystemAllowsMotion(!query.matches);
    const updateVisibility = () => setForeground(document.visibilityState === 'visible');

    updateMotionPreference();
    updateVisibility();
    if (query.addEventListener) query.addEventListener('change', updateMotionPreference);
    else query.addListener?.(updateMotionPreference);
    document.addEventListener('visibilitychange', updateVisibility);

    return () => {
      if (query.removeEventListener) query.removeEventListener('change', updateMotionPreference);
      else query.removeListener?.(updateMotionPreference);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    const target = ref.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting && entry.intersectionRatio >= 0.1);
    }, { threshold: [0, 0.1] });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ref]);

  return animationLevel === 'full' && systemAllowsMotion && inView && foreground;
}

function StoryStream({
  stories,
  className,
  duration,
  shouldAnimate,
}: {
  stories: PlatformStoryCard[];
  className: string;
  duration: number;
  shouldAnimate: boolean;
}) {
  const { colors, isDark } = useTheme();
  const copies = shouldAnimate ? [0, 1] : [0];

  return (
    <div
      className={`${shouldAnimate ? 'h-full overflow-hidden' : 'overflow-visible'} min-w-0 ${className}`}
    >
      <m.div
        animate={shouldAnimate ? { y: '-50%' } : { y: 0 }}
        transition={shouldAnimate ? {
          duration,
          repeat: Infinity,
          ease: 'linear',
          repeatType: 'loop',
        } : { duration: 0 }}
        className="flex flex-col"
      >
        {copies.map((copy) => (
          <div key={copy} aria-hidden={copy > 0} className="flex flex-col gap-6 pb-6">
            {stories.map((story) => (
              <Surface
                key={story.id}
                mode={isDark ? 'dark' : 'light'}
                style={{
                  minHeight: uiTokens.space.hero * 4,
                  justifyContent: 'space-between',
                  gap: uiTokens.space.xl,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: colors.text.secondary,
                      fontSize: uiTokens.type.caption,
                      lineHeight: 18,
                      fontWeight: '700',
                      letterSpacing: 1.1,
                      marginBottom: uiTokens.space.md,
                    }}
                  >
                    {story.eyebrow}
                  </Text>
                  <Text
                    style={{
                      color: colors.text.primary,
                      fontSize: uiTokens.type.title,
                      lineHeight: 30,
                      fontWeight: '700',
                      marginBottom: uiTokens.space.sm,
                    }}
                  >
                    {story.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.text.secondary,
                      fontSize: uiTokens.type.body,
                      lineHeight: 24,
                      opacity: 0.9,
                    }}
                  >
                    {story.description}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md }}>
                  <FeatureIcon name={story.icon} color={story.accentColor} compact />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text.primary,
                        fontSize: uiTokens.type.label,
                        lineHeight: 20,
                        fontWeight: '700',
                      }}
                    >
                      {story.metricValue}
                    </Text>
                    <Text
                      style={{
                        color: colors.text.secondary,
                        fontSize: uiTokens.type.caption,
                        lineHeight: 18,
                        opacity: 0.78,
                      }}
                    >
                      {story.metric}
                    </Text>
                  </View>
                </View>
              </Surface>
            ))}
          </div>
        ))}
      </m.div>
    </div>
  );
}

const PlatformStoryCards = ({ stories }: { stories: PlatformStoryCard[] }) => (
  <StoryStreamContainer stories={stories} />
);

function StoryStreamContainer({ stories }: { stories: PlatformStoryCard[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldAnimate = useStreamMotion(viewportRef);

  return (
    <LazyMotion features={domAnimation}>
      <div
        ref={viewportRef}
        className={`mt-10 flex justify-center gap-6 ${
          shouldAnimate
            ? 'max-h-[740px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)]'
            : 'overflow-visible'
          }`}
      >
        <StoryStream
          stories={stories}
          className="w-full max-w-xs md:hidden"
          duration={42}
          shouldAnimate={shouldAnimate}
        />
        <StoryStream
          stories={stories.slice(0, 5)}
          className="hidden w-full max-w-xs md:block lg:hidden"
          duration={18}
          shouldAnimate={shouldAnimate}
        />
        <StoryStream
          stories={stories.slice(5, 9)}
          className="hidden w-full max-w-xs md:block lg:hidden"
          duration={21}
          shouldAnimate={shouldAnimate}
        />
        <StoryStream
          stories={stories.slice(0, 3)}
          className="hidden w-full max-w-xs lg:block"
          duration={18}
          shouldAnimate={shouldAnimate}
        />
        <StoryStream
          stories={stories.slice(3, 6)}
          className="hidden w-full max-w-xs lg:mt-8 lg:block"
          duration={21}
          shouldAnimate={shouldAnimate}
        />
        <StoryStream
          stories={stories.slice(6, 9)}
          className="hidden w-full max-w-xs lg:mt-4 lg:block"
          duration={19}
          shouldAnimate={shouldAnimate}
        />
      </div>
    </LazyMotion>
  );
}

export default PlatformStoryCards;
