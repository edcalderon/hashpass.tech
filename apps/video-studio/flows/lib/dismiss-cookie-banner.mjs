// The cookie-preferences banner shows on first visit and sits fixed at the
// bottom of the viewport, covering whatever's underneath it (Quick Access
// cards, Your Passes, etc.) — dismiss it before scrolling to anything in
// that region. "Accept"/"Aceptar" text works whether the recording's locale
// is English or Spanish.
export async function dismissCookieBanner(page) {
  const acceptButton = page.getByText(/^(accept|aceptar)$/i).first();
  const dismissed = await acceptButton
    .waitFor({state: 'visible', timeout: 6000})
    .then(() => true)
    .catch(() => false);

  if (dismissed) {
    await acceptButton.click();
    await page.waitForTimeout(500);
  }
}
