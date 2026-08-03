// Attendee profile screen (`/dashboard/profile`) — same auth requirements
// and dev-bypass caveat as flows/dashboard-explore.mjs (see that file):
// with the bypass, `user` is null, so populated fields will show their
// empty/loading state rather than real attendee data. Swap in a real
// --use-state session for a fully populated recording.
export default async function dashboardProfileFlow(page) {
  await page.waitForTimeout(2500);

  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(600);
  }

  // If a real session is active, try focusing an editable field to show the
  // update flow (harmless no-op if the field isn't present/editable).
  const nameField = page.getByPlaceholder(/name/i).first();
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.click();
    await page.waitForTimeout(1200);
  }
}
