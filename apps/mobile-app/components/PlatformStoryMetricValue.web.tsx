import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { uiTokens } from '@hashpass/ui/tokens';

const scheduleFrame = (callback: () => void) =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 16) as unknown as number;

const cancelFrame = (frame: number) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else clearTimeout(frame as unknown as ReturnType<typeof setTimeout>);
};

export default function PlatformStoryMetricValue({
  value,
  animate,
  delay = 0,
  style,
}: {
  value: string;
  animate: boolean;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const target = /^\d+$/.test(value) ? Number(value) : null;
  const [displayValue, setDisplayValue] = useState(value);
  const hasStarted = useRef<string | null>(null);

  useEffect(() => {
    if (target === null || target <= 1) {
      setDisplayValue(value);
      return undefined;
    }
    if (!animate) {
      setDisplayValue(value);
      return undefined;
    }
    if (hasStarted.current === value) return undefined;

    hasStarted.current = value;
    let cancelled = false;
    let frame: number | undefined;
    const timer = setTimeout(() => {
      const startTime = Date.now();
      const tick = () => {
        if (cancelled) return;
        const progress = Math.min(1, (Date.now() - startTime) / uiTokens.motion.entrance);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(String(Math.min(target, Math.max(1, Math.round(eased * target)))));
        if (progress < 1) frame = scheduleFrame(tick);
        else setDisplayValue(value);
      };
      setDisplayValue('1');
      frame = scheduleFrame(tick);
    }, Math.max(0, delay));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (frame !== undefined) cancelFrame(frame);
    };
  }, [animate, delay, target, value]);

  return (
    <Text
      selectable={false}
      accessible
      accessibilityLabel={value}
      accessibilityLiveRegion="none"
      style={[{ fontSize: uiTokens.type.label, lineHeight: 20, fontWeight: '700' }, style]}
    >
      {displayValue}
    </Text>
  );
}
