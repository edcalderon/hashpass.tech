export type PwaDragPosition = {
  left: number;
  top: number;
};

export type PwaDragViewport = {
  width: number;
  height: number;
};

export const PWA_DRAG_POSITION_KEY = 'hashpass:pwa-install-position';
export const PWA_DRAG_BUTTON_SIZE = 70;
export const PWA_DRAG_SAFE_MARGIN = 12;
export const PWA_DRAG_START_THRESHOLD = 5;

const FALLBACK_VIEWPORT: PwaDragViewport = {
  width: 390,
  height: 800,
};

export const getPwaDragViewport = (): PwaDragViewport => {
  if (typeof window === 'undefined') {
    return FALLBACK_VIEWPORT;
  }

  const documentElement = typeof document !== 'undefined' ? document.documentElement : undefined;
  return {
    width: Math.max(documentElement?.clientWidth ?? 0, window.innerWidth ?? 0, FALLBACK_VIEWPORT.width),
    height: Math.max(documentElement?.clientHeight ?? 0, window.innerHeight ?? 0, FALLBACK_VIEWPORT.height),
  };
};

export const clampPwaDragPosition = (
  position: PwaDragPosition,
  viewport: PwaDragViewport = getPwaDragViewport()
): PwaDragPosition => {
  const maxLeft = Math.max(PWA_DRAG_SAFE_MARGIN, viewport.width - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN);
  const maxTop = Math.max(PWA_DRAG_SAFE_MARGIN, viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN);

  return {
    left: Math.min(Math.max(position.left, PWA_DRAG_SAFE_MARGIN), maxLeft),
    top: Math.min(Math.max(position.top, PWA_DRAG_SAFE_MARGIN), maxTop),
  };
};

export const getDefaultPwaDragPosition = (): PwaDragPosition => {
  const viewport = getPwaDragViewport();
  const isMobileViewport = viewport.width <= 768;
  const basePosition = isMobileViewport
    ? {
        left: viewport.width - PWA_DRAG_BUTTON_SIZE - 20,
        top: viewport.height - PWA_DRAG_BUTTON_SIZE - 20,
      }
    : {
        left: 24,
        top: 70,
      };

  return clampPwaDragPosition(basePosition, viewport);
};

export const readStoredPwaDragPosition = (): PwaDragPosition | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedPosition = window.localStorage.getItem(PWA_DRAG_POSITION_KEY);
    if (!storedPosition) {
      return null;
    }

    const parsedPosition = JSON.parse(storedPosition) as Partial<PwaDragPosition>;
    if (typeof parsedPosition.left !== 'number' || typeof parsedPosition.top !== 'number') {
      return null;
    }

    return clampPwaDragPosition(parsedPosition as PwaDragPosition);
  } catch {
    return null;
  }
};

export const storePwaDragPosition = (position: PwaDragPosition) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PWA_DRAG_POSITION_KEY, JSON.stringify(position));
};
