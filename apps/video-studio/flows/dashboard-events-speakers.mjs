// Browse events & speakers — starts on `/dashboard/explore`'s events list,
// clicks into a real event, then the speakers calendar. Same auth/dev-bypass
// caveat as flows/dashboard-explore.mjs: event/speaker content itself is
// public event data (not user-specific), so it renders fully even under the
// dev bypass — only account-specific bits (favorites, my-schedule state)
// would be empty.
//
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/dashboard/explore \
//     --name dashboard/speakers/browse-events \
//     --flow apps/video-studio/flows/dashboard-events-speakers.mjs
export default async function dashboardEventsSpeakersFlow(page) {
  // This route fetches the events list client-side, so real content
  // typically doesn't paint until ~7s into the recording (recording starts
  // at browser-context creation, before goto/hydration) — wait for the
  // actual element instead of a fixed sleep, so a slow first paint doesn't
  // cause the click to be silently skipped.
  const chileEvent = page.getByText(/blockchain summit latam chile/i).first();
  await chileEvent.waitFor({state: 'visible', timeout: 20000}).catch(() => {});

  for (let i = 0; i < 2; i += 1) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(600);
  }

  if (await chileEvent.isVisible().catch(() => false)) {
    await chileEvent.click();
    await page.waitForTimeout(2000);
  }

  const speakersLink = page.getByText(/speakers/i).first();
  if (await speakersLink.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
    await speakersLink.click();
    await page.waitForTimeout(2000);
  }

  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(600);
  }
}
