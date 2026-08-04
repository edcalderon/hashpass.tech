// Dashboard entry (`/dashboard/explore`) — the post-login landing screen,
// which doubles as the events explorer (event cards, quick access grid).
//
// Needs an authenticated session. For a real user's dashboard, record the
// login first with --save-state and reuse it here with --use-state (see
// flows/auth-otp.mjs). For local iteration without a real inbox, the repo's
// dev-only auth bypass (apps/mobile-app/lib/auth/dev-bypass.ts,
// EXPO_PUBLIC_DEV_AUTH_BYPASS=true in .env.local, __DEV__ builds only) lets
// this route render without bouncing to /auth — `user` stays null though,
// so anything keyed off real profile data shows its empty state, not a
// crash. Good enough for the dashboard chrome/navigation itself; swap in a
// real --use-state session once one exists for fully populated footage.
import {dismissCookieBanner} from './lib/dismiss-cookie-banner.mjs';

export default async function dashboardExploreFlow(page) {
  // This route fetches the events list client-side, so real content
  // typically doesn't paint until ~7s into the recording (recording starts
  // at browser-context creation, before goto/hydration) — wait it out
  // before scrolling so the scroll itself lands on real content.
  await page.waitForTimeout(7500);

  // The cookie banner sits fixed at the bottom, covering the "Your Passes"
  // section this flow is scrolling down to show — clear it first.
  await dismissCookieBanner(page);

  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(700);
  }

  // Keep scrolling specifically until "Your Passes" / "Tus Pases" is
  // actually on screen, rather than a fixed scroll count that might stop
  // short of it depending on how many events/quick-access cards render.
  const passesHeading = page.getByText(/your passes|tus pases/i).first();
  await passesHeading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(2000);
}
