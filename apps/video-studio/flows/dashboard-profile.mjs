// Attendee profile update (`/dashboard/profile`) — a real before/after
// demonstration: scroll to "Attendee Information" (shows "Not set" for a
// fresh account), open "Edit Attendee Information", fill in role + company,
// save, and land back on the updated card.
//
// Needs a REAL authenticated session — the dev-only auth bypass leaves
// `user` null and this screen has nothing to render without one (see
// README.md's auth caveat section). Generate one without a real inbox/Google
// account via:
//
//   node packages/tools/scripts/create-demo-session.mjs
//
// then pass it with --use-state apps/video-studio/.recording-state/demo-session.json.
// Not the very first save for the shared demo account (its fields may
// already be set from a prior recording run) — using distinct values here
// still demonstrates a real update (before: whatever was last saved, after:
// these), just not a first-time "Not set" -> filled transition. Override via
// env for a fresh before/after pair on each take (e.g. an ES recording using
// different values than the EN one so both show a real change).
import {dismissCookieBanner} from './lib/dismiss-cookie-banner.mjs';

const ROLE_TITLE = process.env.PROFILE_ROLE_TITLE || 'Engineering Lead';
const COMPANY = process.env.PROFILE_COMPANY || 'HASHPASS Video Studio';

export default async function dashboardProfileFlow(page) {
  await page.waitForTimeout(2500);
  await dismissCookieBanner(page);

  const editButton = page.getByText(/edit attendee information/i).first();
  await editButton.waitFor({state: 'visible', timeout: 15000});
  await editButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await editButton.click();

  const roleField = page.getByPlaceholder(/product manager/i).first();
  await roleField.waitFor({state: 'visible', timeout: 8000});
  await roleField.fill(ROLE_TITLE);
  await page.waitForTimeout(500);

  const companyField = page.getByPlaceholder(/company or organisation/i).first();
  await companyField.fill(COMPANY);
  await page.waitForTimeout(800);

  const saveButton = page.getByText(/save attendee information/i).first();
  await saveButton.click();

  // Wait for the actual save to finish (modal closes) rather than a fixed
  // sleep — a real network round-trip's duration isn't predictable, and a
  // too-short wait previously ended the clip mid-spinner. The page has its
  // own "Edit Attendee Information" trigger button with the same text as
  // the modal title, so wait on the role input itself (only exists inside
  // the modal) instead of text that's ambiguous between the two.
  await roleField.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
  await page.waitForTimeout(1000);

  // Land on the now-updated "Attendee Information" card.
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(2000);
}
