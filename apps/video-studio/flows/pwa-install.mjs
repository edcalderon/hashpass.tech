// Final tutorial step: installing HASHPASS as a PWA from the browser.
// components/PWAPrompt.tsx renders a small collapsed floating button
// (`.hp-pwa-collapsed`, bottom-left of every page) that expands into a card
// with an "Install HASHPASS" action. That action calls the real browser
// `beforeinstallprompt` flow when available, but Chrome only fires that
// event under its own install-heuristics timing — not reliably on demand in
// an automated recording — so it falls back to an in-app instructions card
// (components/PwaInstallPromptCard.tsx) explaining how to install manually.
// That fallback card is what this flow captures; it's real product UI
// either way, not a mock.
import {dismissCookieBanner} from './lib/dismiss-cookie-banner.mjs';

export default async function pwaInstallFlow(page) {
  await page.waitForTimeout(2000);
  await dismissCookieBanner(page);

  const collapsedButton = page.locator('button.hp-pwa-collapsed').first();
  const hasCollapsedButton = await collapsedButton
    .waitFor({state: 'visible', timeout: 8000})
    .then(() => true)
    .catch(() => false);

  if (hasCollapsedButton) {
    await collapsedButton.click();
    await page.waitForTimeout(1200);
  }

  const installAction = page.getByText(/install hashpass|instalar hashpass/i).first();
  const hasInstallAction = await installAction
    .waitFor({state: 'visible', timeout: 8000})
    .then(() => true)
    .catch(() => false);

  if (hasInstallAction) {
    await installAction.click();
    await page.waitForTimeout(1500);
  }

  // Land on and hold the instructions card for the clip's remaining length.
  await page.waitForTimeout(4000);
}
