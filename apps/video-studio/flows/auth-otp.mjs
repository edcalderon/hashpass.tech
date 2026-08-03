// Sign-in tutorial: email OTP (`/auth`, "OTP Code" tab — the default tab is
// "Magic Link", this flow switches to the 6-digit code tab).
//
// OTP codes land in a real inbox, so this can't run fully unattended — the
// flow fills the email and sends the code, then pauses so you can read the
// real code and type/verify it by hand while the recording keeps rolling.
// Run headed:
//
//   AUTH_DEMO_EMAIL=you@example.com \
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/auth \
//     --name auth/otp/sign-in --headed \
//     --flow apps/video-studio/flows/auth-otp.mjs \
//     --save-state apps/video-studio/.recording-state/otp-session.json
//
// `--save-state` captures the resulting session so the dashboard flows
// (find-speakers, request-meeting) can reuse it via `--use-state` instead of
// logging in again for every recording.
const DEMO_EMAIL = process.env.AUTH_DEMO_EMAIL;

export default async function authOtpFlow(page) {
  if (!DEMO_EMAIL) {
    console.warn('AUTH_DEMO_EMAIL not set — pausing on the empty form instead of auto-filling it.');
    await page.waitForTimeout(30000);
    return;
  }

  await page.waitForTimeout(1500);

  const emailInput = page.getByPlaceholder(/enter your email/i);
  await emailInput.fill(DEMO_EMAIL);
  await page.waitForTimeout(500);

  // Switch from the default "Magic Link" tab to "OTP Code".
  const otpTab = page.getByText(/otp code/i).first();
  if (await otpTab.isVisible().catch(() => false)) {
    await otpTab.click();
    await page.waitForTimeout(500);
  }

  const sendCode = page.getByText(/send code/i).first();
  await sendCode.click();

  console.log('Code sent — check the inbox for the 6-digit code and enter it now.');
  console.log('Recording continues for 25s; click "Verify Code" once the digits are in.');
  await page.waitForTimeout(25000);
}
