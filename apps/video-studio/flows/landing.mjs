// Public landing page (`/home`) walkthrough — hero, flipping tagline,
// testimonials/CTA, footer. No auth needed.
//
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/home \
//     --name landing/hero \
//     --flow apps/video-studio/flows/landing.mjs
export default async function landingFlow(page) {
  // Let the hero animate in and the tagline flip through a couple of words.
  await page.waitForTimeout(3000);

  // Slow scroll through tagline / testimonials / "ready to simplify" CTA / footer.
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(700);
  }

  // Hover the primary CTA ("Get Started Now") before the clip ends.
  const cta = page.getByText(/get started/i).first();
  if (await cta.isVisible().catch(() => false)) {
    await cta.scrollIntoViewIfNeeded();
    await cta.hover();
    await page.waitForTimeout(1500);
  }
}
