// BSL On Tour showcase: the "Meeting request & schedule" clip — one
// continuous recording that combines what dashboard-find-speakers.mjs and
// dashboard-request-meeting.mjs do as two separate steps, since a single
// Playwright browser context produces exactly one video file. Start on
// /events/<slug>/networking with the demo session (see README.md's "Real
// captures need a real session" section) — this opens "Find Speakers",
// browses the list, opens the first speaker profile, then walks through
// the "Request Meeting" modal.
//
//   node packages/tools/scripts/create-demo-session.mjs
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/events/chile2026/networking \
//     --name bsl/meeting-request \
//     --flow apps/video-studio/flows/bsl-meeting-request.mjs \
//     --use-state apps/video-studio/.recording-state/demo-session.json
//
// SAFETY: stops right before the final "Send Request" tap by default (same
// as dashboard-request-meeting.mjs), so retakes don't spam real meeting
// requests. Set CONFIRM_SEND=1 to actually submit.
import {dismissCookieBanner} from './lib/dismiss-cookie-banner.mjs';

const CONFIRM_SEND = process.env.CONFIRM_SEND === '1';

export default async function bslMeetingRequestFlow(page) {
  await page.waitForTimeout(2500);
  await dismissCookieBanner(page);

  const findSpeakers = page.getByText(/find speakers|buscar ponentes|encontrar ponentes/i).first();
  await findSpeakers.click();
  await page.waitForTimeout(2500);

  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(600);
  }

  // Target a real "Active" speaker row by name rather than a generic
  // card/button selector — the list also renders "Inactive" (unclickable,
  // greyed-out) rows and other page chrome (search box, filter icon) that a
  // loose `[role="button"], a, [class*="card"]` selector can land on first.
  const speaker = page.getByText('Rodrigo Sainz').first();
  await speaker.scrollIntoViewIfNeeded();
  await speaker.click();
  await page.waitForTimeout(2000);

  // The profile screen shows a "Checking meeting request status…" loading
  // state before "Request Meeting" appears — it resolves client-side
  // against the pass/entitlement API, ~5-7s after navigation, not on the
  // initial paint.
  // This resolves against the pass/entitlement API client-side — real
  // captures have seen it take up to ~7s after the profile page navigates,
  // well past the initial paint, so wait for it explicitly rather than a
  // fixed delay (which either cuts it off or wastes recording time).
  const requestMeeting = page.getByText(/^request meeting$|^solicitar reuni[oó]n$/i).first();
  await requestMeeting.waitFor({state: 'visible', timeout: 20000});
  await requestMeeting.scrollIntoViewIfNeeded().catch(() => {});
  await requestMeeting.click();
  await page.waitForTimeout(2000);

  // The textarea's placeholder ("Tell the speaker why you'd like to
  // meet...") doesn't contain the word "message" itself — the field is
  // simplest to grab as the modal's only <textarea>.
  const messageField = page.locator('textarea').first();
  if (await messageField.isVisible().catch(() => false)) {
    await messageField.fill(
      'Loved your talk — would love to swap notes on real-time payments.',
    );
    await page.waitForTimeout(1800);
  }

  const intention = page.getByText(/explore potential collaboration|explorar potencial colaboraci[oó]n/i).first();
  if (await intention.isVisible().catch(() => false)) {
    await intention.click();
    await page.waitForTimeout(1400);
  }

  // Everything up to here is mostly loading/transition states that
  // trimStartSeconds cuts from the final composition — this final hold on
  // the completed, filled-out modal (hovering "Send Request") is the part
  // that actually ends up on screen, so it needs real dwell time.
  const sendRequest = page.getByText(/send request|enviar solicitud/i).first();
  await sendRequest.scrollIntoViewIfNeeded().catch(() => {});
  await sendRequest.hover().catch(() => {});
  await page.waitForTimeout(4000);

  if (CONFIRM_SEND) {
    await sendRequest.click();
    console.log('CONFIRM_SEND=1 — meeting request actually submitted.');
    await page.waitForTimeout(2000);
  } else {
    console.log('Stopped before submitting (CONFIRM_SEND not set) — hovering "Send Request" only.');
  }
}
