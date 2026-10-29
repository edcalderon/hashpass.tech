const MIN_SCROLL_DURATION_MS = 900;
const MAX_SCROLL_DURATION_MS = 2200;
const SCROLL_MS_PER_PIXEL = 0.4;
let activeScrollCleanup: (() => void) | undefined;

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

export function scrollToAnchor(targetId: string): void {
  const target = document.getElementById(targetId);
  if (!target) return;

  activeScrollCleanup?.();

  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  const scrollMargin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const targetTop = target.getBoundingClientRect().top + window.scrollY - scrollMargin;
  const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
  const destination = Math.min(maxScroll, Math.max(0, targetTop));
  const start = window.scrollY;
  const distance = destination - start;
  const hash = `#${encodeURIComponent(targetId)}`;

  if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  if (Math.abs(distance) < 2) return;

  // Keep the gallery runway visible instead of letting native anchor scrolling
  // pass through the scroll-driven animation before it can be seen.
  root.style.scrollBehavior = 'auto';

  const userPrefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const landingMotionMode = window.localStorage.getItem('hashpass_landing_animation_mode');
  if (userPrefersReducedMotion || landingMotionMode === 'static') {
    window.scrollTo({ top: destination, behavior: 'auto' });
    root.style.scrollBehavior = previousScrollBehavior;
    return;
  }

  const duration = Math.min(
    MAX_SCROLL_DURATION_MS,
    Math.max(MIN_SCROLL_DURATION_MS, Math.abs(distance) * SCROLL_MS_PER_PIXEL),
  );
  const startedAt = performance.now();
  let frame = 0;

  const cancelForUserInput = () => cleanup();
  const cleanup = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', cancelForUserInput);
    window.removeEventListener('touchstart', cancelForUserInput);
    window.removeEventListener('keydown', cancelForUserInput);
    root.style.scrollBehavior = previousScrollBehavior;
    if (activeScrollCleanup === cleanup) activeScrollCleanup = undefined;
  };
  const animate = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    window.scrollTo(0, start + distance * easeInOutCubic(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(animate);
    } else {
      cleanup();
    }
  };

  activeScrollCleanup = cleanup;
  window.addEventListener('wheel', cancelForUserInput, { passive: true, once: true });
  window.addEventListener('touchstart', cancelForUserInput, { passive: true, once: true });
  window.addEventListener('keydown', cancelForUserInput, { once: true });
  frame = requestAnimationFrame(animate);
}
