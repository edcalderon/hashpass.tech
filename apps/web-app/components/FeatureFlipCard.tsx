"use client";

import React, { useMemo, useState } from 'react';
import { Code2, KeyRound, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'expo-router';
import { cn } from '../lib/utils';
import { InteractiveHoverButton } from './InteractiveHoverButton';

export interface FeatureFlipCardProps {
  title: string;
  description: string;
  icon?: 'shield-checkmark' | 'key' | 'sync' | string;
  color?: string;
  hintText?: string;
  actionText?: string;
  isDark?: boolean;
  actionHref?: string;
}

const iconMap = {
  'shield-checkmark': ShieldCheck,
  key: KeyRound,
  sync: RefreshCcw,
} as const;

export default function FeatureFlipCard({
  title,
  description,
  icon = 'shield-checkmark',
  color = '#06b6d4',
  hintText = 'Hover to read more',
  actionText = 'Learn More',
  isDark = false,
  actionHref = '/(shared)/auth',
}: FeatureFlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const router = useRouter();

  const IconComponent = useMemo(() => {
    return iconMap[icon as keyof typeof iconMap] || Code2;
  }, [icon]);

  return (
    <div
      style={
        {
          '--primary': color,
          width: 'min(320px, 92vw)',
        } as React.CSSProperties
      }
      className="group relative h-[320px] [perspective:2000px]"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onClick={() => setIsFlipped((value) => !value)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setIsFlipped((value) => !value);
        }
      }}
      aria-label={title}
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
          className={cn(
            'absolute inset-0 h-full w-full',
            '[transform:rotateY(0deg)] [backface-visibility:hidden]',
            'overflow-hidden rounded-3xl',
            'border',
            isDark
              ? 'bg-[#07070a] border-[#1d1d23] shadow-[0_14px_34px_rgba(0,0,0,0.55)]'
              : 'bg-[#f8fafc] border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.08)]'
          )}
        >
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-8 pb-5 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full border transition-transform duration-300 group-hover:scale-105"
              style={{ borderColor: `${color}66`, backgroundColor: `${color}1f`, color }}
            >
              <IconComponent className="h-7 w-7" />
            </div>

            <h3 className={cn('text-[40px] font-extrabold leading-none tracking-tight', isDark ? 'text-white' : 'text-zinc-900')}>
              {title}
            </h3>

            <p className={cn('text-xs font-semibold tracking-[0.2em] uppercase', isDark ? 'text-zinc-400' : 'text-zinc-500')}>
              {hintText}
            </p>
          </div>
        </div>

        <div
          className={cn(
            'absolute inset-0 h-full w-full',
            '[transform:rotateY(180deg)] [backface-visibility:hidden]',
            'rounded-3xl p-6',
            'border',
            isDark
              ? 'bg-[#07070a] border-[#1d1d23] shadow-[0_14px_34px_rgba(0,0,0,0.55)]'
              : 'bg-[#f8fafc] border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.08)]',
            'flex flex-col'
          )}
        >
          <div className="relative z-10 flex h-full flex-col">
            <div className="mb-4 flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: `${color}66`, backgroundColor: `${color}1f`, color }}
              >
                <IconComponent className="h-4 w-4" />
              </div>
              <h3 className={cn('text-lg font-semibold tracking-tight', isDark ? 'text-white' : 'text-zinc-900')}>{title}</h3>
            </div>

            <p className={cn('text-base leading-8', isDark ? 'text-zinc-200' : 'text-zinc-700')}>
              {description}
            </p>

            <div className="mt-auto pt-5">
              <InteractiveHoverButton
                text={actionText}
                className="w-full !border-cyan-400/30 !bg-cyan-500/12 !py-2.5 !text-base"
                onClick={(event) => {
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
