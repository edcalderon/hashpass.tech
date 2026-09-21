"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { cn } from '../lib/utils';
import { InteractiveHoverButton } from './InteractiveHoverButton';
import FeatureIcon from './FeatureIcon';

export interface FeatureFlipCardProps {
  title: string;
  description: string;
  icon?: 'shield-checkmark' | 'key' | 'sync' | string;
  color?: string;
  hintText?: string;
  actionText?: string;
  isDark?: boolean;
  actionHref?: string;
  metric?: string;
  metricValue?: number;
  metricLabel?: string;
  reduceMotion?: boolean;
  /** Lets the carousel hold a flipped card in view while its details are read. */
  isFlipped?: boolean;
  onFlipChange?: (isFlipped: boolean, card: HTMLDivElement) => void;
}

export default function FeatureFlipCard({
  title,
  description,
  icon = 'shield-checkmark',
  color = '#06b6d4',
  hintText = 'Hover to read more',
  actionText = 'Learn More',
  isDark = false,
  actionHref = '/(shared)/auth',
  metric,
  metricValue,
  metricLabel,
  reduceMotion = false,
  isFlipped: controlledIsFlipped,
  onFlipChange,
}: FeatureFlipCardProps) {
  const [uncontrolledIsFlipped, setUncontrolledIsFlipped] = useState(false);
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    setCount(null);
    if (typeof metricValue !== 'number') return;
    let frame = 0; const started = performance.now();
    const tick = (now: number) => { const progress = Math.min(1, (now - started) / 520); setCount(Math.max(1, Math.round(metricValue * (1 - Math.pow(1 - progress, 3))))); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [metricValue]);

  const isFlipped = controlledIsFlipped ?? uncontrolledIsFlipped;
  const setFlipped = (nextIsFlipped: boolean, card: HTMLDivElement) => {
    if (controlledIsFlipped === undefined) {
      setUncontrolledIsFlipped(nextIsFlipped);
    }
    onFlipChange?.(nextIsFlipped, card);
  };

  return (
    <div
      style={
        {
          '--primary': color,
          width: '100%',
          height: 220,
        } as React.CSSProperties
      }
      className="group relative [perspective:2000px]"
      onMouseEnter={(event) => setFlipped(true, event.currentTarget)}
      onMouseLeave={(event) => setFlipped(false, event.currentTarget)}
      onClick={(event) => setFlipped(!isFlipped, event.currentTarget)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setFlipped(!isFlipped, event.currentTarget);
        }
      }}
      aria-label={title}
      aria-expanded={isFlipped}
    >
      <div
        className={cn(
          'relative h-full w-full',
          '[transform-style:preserve-3d]',
          'transition-all duration-700',
          isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
        )}
      >
        <div
          aria-hidden={isFlipped}
          className={cn(
            'absolute inset-0 h-full w-full',
            '[transform:rotateY(0deg)] [backface-visibility:hidden]',
            'overflow-hidden rounded-3xl',
            'border',
            isDark
              ? 'bg-[#19191f] border-[#34343e]'
              : 'bg-[#f7f9fa] border-[#dfe3e8]'
          )}
        >
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 px-5 py-4 text-center">
            <FeatureIcon name={icon} color={color} visible={!isFlipped} reduceMotion={reduceMotion} />

            <h3 className={cn('text-[22px] font-bold leading-tight tracking-tight', isDark ? 'text-white' : 'text-zinc-900')}>
              {title}
            </h3>

            <p className={cn('text-[10px] font-semibold tracking-[0.16em] uppercase', isDark ? 'text-zinc-400' : 'text-zinc-500')}>
              {hintText}
            </p>
          </div>
        </div>

        <div
          aria-hidden={!isFlipped}
          className={cn(
            'absolute inset-0 h-full w-full',
            '[transform:rotateY(180deg)] [backface-visibility:hidden]',
            'rounded-3xl p-4',
            'border',
            isDark
              ? 'bg-[#19191f] border-[#34343e]'
              : 'bg-[#f7f9fa] border-[#dfe3e8]',
            'flex flex-col'
          )}
        >
          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <div className="mb-2 flex items-center gap-2">
              <FeatureIcon name={icon} color={color} compact visible={isFlipped} reduceMotion={reduceMotion} />
              <h3 className={cn('text-sm font-semibold tracking-tight', isDark ? 'text-white' : 'text-zinc-900')}>{title}</h3>
            </div>

            <div className="min-h-0 flex-1">
              <p className={cn('text-[13px] leading-5', isDark ? 'text-zinc-200' : 'text-zinc-700')}>
                {typeof metricValue === 'number' && count === null ? <span aria-label="Loading live metric" className={cn('mr-2 inline-block h-5 w-10 animate-pulse rounded', isDark ? 'bg-zinc-700' : 'bg-zinc-200')} /> : null}
                {count !== null ? <strong className={cn('mr-1 text-xl leading-none tracking-tight', isDark ? 'text-white' : 'text-zinc-900')}>{count.toLocaleString()}</strong> : null}
                {metricLabel ? <span className={cn('mr-1 font-semibold', isDark ? 'text-zinc-300' : 'text-zinc-800')}>{metricLabel}.</span> : null}
                {description}
              </p>
            </div>

            <div className="mt-auto shrink-0 pt-3">
              <InteractiveHoverButton
                tabIndex={isFlipped ? 0 : -1}
                text={actionText}
                tone={isDark ? 'dark' : 'light'}
                className="w-full !py-2 !text-sm"
                onClick={(event: React.MouseEvent<HTMLElement>) => {
                  event.stopPropagation();
                  router.push(actionHref as any);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
