export type PwaDragPosition = {
  left: number;
  top: number;
};

export type PwaDragViewport = {
  width: number;
  height: number;
};

export const PWA_DRAG_POSITION_KEY = 'hashpass:pwa-install-position';
export const PWA_DOCK_POSITIONS = ['top-left', 'bottom-left', 'bottom-right'] as const;
export const PWA_DRAG_BUTTON_SIZE = 70;
export const PWA_DRAG_SAFE_MARGIN = 12;
export const PWA_DRAG_START_THRESHOLD = 5;

export type PwaDockPosition = (typeof PWA_DOCK_POSITIONS)[number];

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

const isPwaDockPosition = (value: unknown): value is PwaDockPosition =>
  typeof value === 'string' && (PWA_DOCK_POSITIONS as readonly string[]).includes(value);

const isPwaDragPosition = (value: unknown): value is PwaDragPosition => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const possiblePosition = value as Partial<PwaDragPosition>;
  return typeof possiblePosition.left === 'number' && typeof possiblePosition.top === 'number';
};

export const getPwaDockPositionCoordinates = (
  dockPosition: PwaDockPosition,
  viewport: PwaDragViewport = getPwaDragViewport()
): PwaDragPosition => {
  const bottomTop = viewport.height - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN;
  const rightLeft = viewport.width - PWA_DRAG_BUTTON_SIZE - PWA_DRAG_SAFE_MARGIN;

  const coordinatesByDock: Record<PwaDockPosition, PwaDragPosition> = {
    'top-left': {
      left: PWA_DRAG_SAFE_MARGIN,
      top: PWA_DRAG_SAFE_MARGIN,
    },
    'bottom-left': {
      left: PWA_DRAG_SAFE_MARGIN,
      top: bottomTop,
    },
    'bottom-right': {
      left: rightLeft,
      top: bottomTop,
    },
  };

  return clampPwaDragPosition(coordinatesByDock[dockPosition], viewport);
};

export const getDefaultPwaDockPosition = (): PwaDockPosition => {
  const viewport = getPwaDragViewport();
  return viewport.width <= 768 ? 'bottom-right' : 'top-left';
};

export const getDefaultPwaDragPosition = (): PwaDragPosition => {
  return getPwaDockPositionCoordinates(getDefaultPwaDockPosition());
};

export const resolveNearestPwaDockPosition = (
  position: PwaDragPosition,
  viewport: PwaDragViewport = getPwaDragViewport()
): PwaDockPosition => {
  const clampedPosition = clampPwaDragPosition(position, viewport);
  const [nearestDockPosition] = PWA_DOCK_POSITIONS.reduce(
    ([currentDock, currentDistance], candidateDock) => {
      const candidatePosition = getPwaDockPositionCoordinates(candidateDock, viewport);
      const distance =
        (candidatePosition.left - clampedPosition.left) ** 2 +
        (candidatePosition.top - clampedPosition.top) ** 2;

      return distance < currentDistance ? [candidateDock, distance] : [currentDock, currentDistance];
    },
    ['top-left', Number.POSITIVE_INFINITY] as [PwaDockPosition, number]
  );

  return nearestDockPosition;
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
    if (isPwaDockPosition(parsedPosition)) {
      return getPwaDockPositionCoordinates(parsedPosition);
    }

    if (!isPwaDragPosition(parsedPosition)) {
      return null;
    }

    return clampPwaDragPosition(parsedPosition);
  } catch {
    return null;
  }
};

export const readStoredPwaDockPosition = (): PwaDockPosition | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedPosition = window.localStorage.getItem(PWA_DRAG_POSITION_KEY);
    if (!storedPosition) {
      return null;
    }

    const parsedPosition = JSON.parse(storedPosition) as unknown;
    if (isPwaDockPosition(parsedPosition)) {
      return parsedPosition;
    }

    if (!isPwaDragPosition(parsedPosition)) {
      return null;
    }

    return resolveNearestPwaDockPosition(parsedPosition);
  } catch {
    return null;
  }
};

export const storePwaDockPosition = (dockPosition: PwaDockPosition) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PWA_DRAG_POSITION_KEY, JSON.stringify(dockPosition));
};

export const storePwaDragPosition = (position: PwaDragPosition) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PWA_DRAG_POSITION_KEY, JSON.stringify(position));
};
