// Browse events & speakers — starts on `/dashboard/explore`'s events list
// and demonstrates actually switching between events: each click on an
// event row calls handleEventSelect() (see explore.tsx), which updates the
// hero banner (title/subtitle/countdown) and the "Quick Access" grid below
// in place on the same page — no navigation between clicks, so the
// recording should clearly show the banner changing each time, not just one
// static selection.
//
// Needs an authenticated session — event/speaker data itself is public
// (not user-specific), so either a real session
// (--use-state .recording-state/demo-session.json) or the dev-only auth
// bypass works equally well here; a real session is used for visual
// consistency with the other post-login clips.
import {dismissCookieBanner} from './lib/dismiss-cookie-banner.mjs';

export default async function dashboardEventsSpeakersFlow(page) {
  // This route fetches the events list client-side, so real content
  // typically doesn't paint until ~7s into the recording (recording starts
  // at browser-context creation, before goto/hydration) — wait for the
  // actual element instead of a fixed sleep, so a slow first paint doesn't
  // cause a click to be silently skipped.
  const chileEvent = page.getByText(/blockchain summit latam chile/i).first();
  await chileEvent.waitFor({state: 'visible', timeout: 20000}).catch(() => {});

  // The cookie banner sits fixed at the bottom and can intercept clicks on
  // whatever event row happens to render underneath it.
  await dismissCookieBanner(page);

  await page.waitForTimeout(500);
  await chileEvent.click();
  await page.waitForTimeout(2500);

  // Scroll down enough to see the Quick Access grid this selection produced.
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(1500);

  // Scroll back up to the events list to make the next click visible too.
  await page.mouse.wheel(0, -320);
  await page.waitForTimeout(800);

  const colombiaEvent = page.getByText(/blockchain summit latam colombia/i).first();
  if (await colombiaEvent.isVisible().catch(() => false)) {
    await colombiaEvent.click();
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(800);
  }

  const peruEvent = page.getByText(/blockchain summit latam per/i).first();
  if (await peruEvent.isVisible().catch(() => false)) {
    await peruEvent.click();
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(1500);
  }
}
