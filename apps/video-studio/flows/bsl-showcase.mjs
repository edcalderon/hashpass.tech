// Scripted walkthrough for the BSL On Tour showcase clip.
// Run against the Expo web target from `pnpm dev:all` (mobile app on
// http://localhost:8081 by default — check the dev-all.sh log for the
// actual claimed port) with a real event slug, e.g.:
//
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/events/chile-2026/home \
//     --name bsl-home-agenda \
//     --flow apps/video-studio/flows/bsl-showcase.mjs
//
// TODO: the click/scroll steps below are placeholders — run once with
// `PWDEBUG=1` (Playwright inspector) against a real dev server to find the
// actual copy/labels for this event's hero, agenda tabs, and CTA, then
// replace the getByText() guesses with the real ones.
export default async function bslShowcaseFlow(page) {
  await page.waitForTimeout(1500);

  // Hero / pass claim CTA.
  const claimCta = page.getByText(/claim|get your pass/i).first();
  if (await claimCta.isVisible().catch(() => false)) {
    await claimCta.hover();
    await page.waitForTimeout(1000);
  }

  // Scroll through the agenda / speaker sections.
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(600);
  }

  // Agenda tab, if present on this route.
  const agendaTab = page.getByText(/agenda/i).first();
  if (await agendaTab.isVisible().catch(() => false)) {
    await agendaTab.click();
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1200);
  }
}
