// Maps a failed public-artwork publish to the translation key of the toast the
// visitor should see. The links API answers with English-only, developer-facing
// messages ("Not found"), so only the status code is trusted here.
export function getPublishErrorKey(status: number, captchaExpired?: boolean) {
  if (captchaExpired) return 'shareCaptchaPrompt';
  if (status === 413) return 'shareImageTooLarge';
  if (status === 429) return 'sharePublishRateLimited';
  // 404 means the deployed API does not know this route (stale deployment);
  // 5xx means it is down. Neither is something the visitor can fix by retrying
  // the captcha, so say the service is unavailable instead.
  if (status === 404 || status >= 500) return 'sharePublishUnavailable';
  return 'sharePublishError';
}
