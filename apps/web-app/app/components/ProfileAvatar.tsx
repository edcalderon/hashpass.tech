'use client';

import { useEffect, useState } from 'react';
import type { ProfileAvatarProps } from './types/ProfileAvatar.types';
import styles from './ProfileAvatar.module.css';

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase() || 'HP';
}

export function ProfileAvatar({ src, name, size = 40, className }: ProfileAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    setFailedSource(null);
  }, [src]);

  const imageSource = src && failedSource !== src ? src : null;
  const rootClassName = [styles.avatar, className].filter(Boolean).join(' ');

  return (
    <span
      className={rootClassName}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {imageSource ? (
        <img className={styles.image} src={imageSource} alt="" onError={() => setFailedSource(imageSource)} />
      ) : (
        <span className={styles.fallback}>{initials(name)}</span>
      )}
    </span>
  );
}
