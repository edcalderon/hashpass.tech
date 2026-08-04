// Dashboard tutorial: open a speaker profile and walk through the
// "Request Meeting" modal (the copilot tutorial in the app itself describes
// this exact flow — "click the 'Request Meeting' button below").
//
// Needs an authenticated session, same as dashboard-find-speakers.mjs — see
// that file for how to capture/reuse one via --save-state/--use-state.
// Point --url at a specific speaker profile
// (http://localhost:8081/events/<slug>/speakers/<id>) so the recording
// doesn't depend on list ordering.
//
// SAFETY: this stops right before the final "Send Request" tap by default,
// so running it repeatedly for retakes doesn't spam real meeting requests
// against whatever backend this is pointed at. Set CONFIRM_SEND=1 only when
// you actually want the request to go through.
const CONFIRM_SEND = process.env.CONFIRM_SEND === '1';

export default async function dashboardRequestMeetingFlow(page) {
  await page.waitForTimeout(1500);

  const requestMeeting = page.getByText(/request meeting/i).first();
  await requestMeeting.click();
  await page.waitForTimeout(1500);

  const messageField = page.getByPlaceholder(/message/i).first();
  if (await messageField.isVisible().catch(() => false)) {
    await messageField.fill("Loved your talk — would love to swap notes on real-time payments.");
    await page.waitForTimeout(1000);
  }

  const sendRequest = page.getByText(/send request/i).first();
  await sendRequest.scrollIntoViewIfNeeded().catch(() => {});
  await sendRequest.hover().catch(() => {});
  await page.waitForTimeout(1500);

  if (CONFIRM_SEND) {
    await sendRequest.click();
    console.log('CONFIRM_SEND=1 — meeting request actually submitted.');
    await page.waitForTimeout(2000);
  } else {
    console.log('Stopped before submitting (CONFIRM_SEND not set) — hovering "Send Request" only.');
  }
}
