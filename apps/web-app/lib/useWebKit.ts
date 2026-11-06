'use client';

import { useEffect, useState } from 'react';

/** Detect WebKit so scroll-heavy visuals can use a stable, static fallback. */
export function useWebKit() {
  const [isWebKit, setIsWebKit] = useState(false);

  useEffect(() => {
    setIsWebKit(window.CSS.supports('-webkit-touch-callout', 'none'));
  }, []);

  return isWebKit;
}
