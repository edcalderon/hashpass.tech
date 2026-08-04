// Sign-in tutorial: Google (`/auth`, "Sign in with Google" button).
//
// Google's real OAuth consent screen actively blocks automated browsers —
// there is no reliable headless/scripted way through it. This flow only
// clicks the button and then gets out of the way; run it headed with a real
// Chrome channel and complete the account picker/consent screen by hand:
//
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/auth \
//     --name auth/google/sign-in --headed --channel chrome \
//     --flow apps/video-studio/flows/auth-google.mjs \
//     --save-state apps/video-studio/.recording-state/google-session.json
export default async function authGoogleFlow(page) {
  await page.waitForTimeout(1500);

  const googleButton = page.getByText(/sign in with google/i).first();
  await googleButton.click();

  console.log('Google sign-in opened — pick the account and complete consent manually.');
  console.log('Recording continues for 30s to capture the redirect back into the app.');
  await page.waitForTimeout(30000);
}
