// Dashboard tutorial: Networking → "Find Speakers" quick-access card, then
// browse the speaker list/calendar.
//
// Needs an authenticated session — record `auth-otp.mjs` or
// `auth-google.mjs` first with `--save-state` to capture one, then reuse it
// here with `--use-state` instead of logging in again:
//
//   EVENT_SLUG=chile2026 \
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url "http://localhost:8081/events/${EVENT_SLUG:-chile2026}/networking" \
//     --name dashboard/speakers/find-speakers \
//     --flow apps/video-studio/flows/dashboard-find-speakers.mjs \
//     --use-state apps/video-studio/.recording-state/otp-session.json
export default async function dashboardFindSpeakersFlow(page) {
  await page.waitForTimeout(1500);

  const findSpeakers = page.getByText(/find speakers/i).first();
  await findSpeakers.click();

  await page.waitForTimeout(2000);

  // Browse the speaker list/calendar.
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 280);
    await page.waitForTimeout(600);
  }

  // Open the first speaker profile, if the list rendered any cards.
  const firstSpeakerCard = page.locator('[role="button"], a, [class*="card" i]').first();
  if (await firstSpeakerCard.isVisible().catch(() => false)) {
    await firstSpeakerCard.click();
    await page.waitForTimeout(2000);
  }
}
