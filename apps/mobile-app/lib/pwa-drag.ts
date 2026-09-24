export type PwaDragPosition = {
  left: number;
  top: number;
};

export type PwaDragViewport = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

export const PWA_DRAG_POSITION_KEY = 'hashpass:pwa-install-position';
export const PWA_DRAG_BUTTON_SIZE = 70;
export const PWA_DRAG_SAFE_MARGIN = 12;
// Keep the control above mobile browser toolbars and gesture navigation. The
// visual viewport supplies the visible browser area; this is extra breathing
// room so the drag handle remains reachable at the lower edge.
export const PWA_DRAG_BOTTOM_SAFE_MARGIN = 48;
export const PWA_DRAG_START_THRESHOLD = 5;

const FALLBACK_VIEWPORT: PwaDragViewport = {
  width: 390,
  height: 800,
  offsetLeft: 0,
  offsetTop: 0,
};

export const getPwaDragViewport = (): PwaDragViewport => {
  if (typeof window === 'undefined') {
    return FALLBACK_VIEWPORT;
  }

  // The layout viewport can remain taller than the visible viewport while a
  // mobile browser's address/action bar is expanded. Retain visual-viewport
  // offsets too, so a panned or zoomed page uses the reachable screen bounds.
  const visualViewport = window.visualViewport;
  const width = visualViewport?.width ?? window.innerWidth;
  const height = visualViewport?.height ?? window.innerHeight;
  return {
    width: width > 0 ? width : FALLBACK_VIEWPORT.width,
    height: height > 0 ? height : FALLBACK_VIEWPORT.height,
    offsetLeft: visualViewport?.offsetLeft ?? 0,
    offsetTop: visualViewport?.offsetTop ?? 0,
  };
};

export const clampPwaDragPosition = (
  position: PwaDragPosition,
  viewport: PwaDragViewport = getPwaDragViewport()
): PwaDragPosition => {
  const minLeft = viewport.offsetLeft + PWA_DRAG_SAFE_MARGIN;
  const minTop = viewport.offsetTop + PWA_DRAG_SAFE_MARGIN;
  const maxLeft = Math.max(minLeft, viewport.offsetLeft + viewport.width - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN);
  const maxTop = Math.max(
    minTop,
    viewport.offsetTop + viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_BOTTOM_SAFE_MARGIN
  );

  return {
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
    top: Math.min(Math.max(position.top, minTop), maxTop),
  };
};

export const getDefaultPwaDragPosition = (
  viewport: PwaDragViewport = getPwaDragViewport()
): PwaDragPosition =>
  clampPwaDragPosition(
    {
      left: viewport.offsetLeft + PWA_DRAG_SAFE_MARGIN,
      top: viewport.offsetTop + viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_BOTTOM_SAFE_MARGIN,
    },
    viewport
  );

const isPwaDragPosition = (value: unknown): value is PwaDragPosition => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const possiblePosition = value as Partial<PwaDragPosition>;
  return Number.isFinite(possiblePosition.left) && Number.isFinite(possiblePosition.top);
};

const legacyDockPosition = (position: string, viewport: PwaDragViewport): PwaDragPosition | null => {
  switch (position) {
    case 'top-left':
      return { left: viewport.offsetLeft + PWA_DRAG_SAFE_MARGIN, top: viewport.offsetTop + PWA_DRAG_SAFE_MARGIN };
    case 'bottom-left':
      return getDefaultPwaDragPosition(viewport);
    case 'bottom-right':
      return {
        left: viewport.offsetLeft + viewport.width - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN,
        top: viewport.offsetTop + viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_BOTTOM_SAFE_MARGIN,
      };
    default:
      return null;
  }
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

    const parsedPosition = JSON.parse(storedPosition) as unknown;
    const viewport = getPwaDragViewport();
    if (typeof parsedPosition === 'string') {
      const migrated = legacyDockPosition(parsedPosition, viewport);
      return migrated ? clampPwaDragPosition(migrated, viewport) : null;
    }

    return isPwaDragPosition(parsedPosition) ? clampPwaDragPosition(parsedPosition, viewport) : null;
  } catch {
    return null;
  }
};

export const storePwaDragPosition = (position: PwaDragPosition) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PWA_DRAG_POSITION_KEY, JSON.stringify(clampPwaDragPosition(position)));
};
