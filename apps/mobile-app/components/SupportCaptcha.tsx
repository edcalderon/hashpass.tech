// Native no-op stub -- see SupportCaptcha.web.tsx and EventProposalCaptcha.tsx
// (the same split this mirrors). The underlying @hashpass/ui CaptchaWidget
// loads Cap's widget from a CDN via a browser <script>/customElements, so it
// only exists on web. Now that /support is a public, anonymous-reachable
// page (see app/_layout.tsx's isPublicPage), it's the abuse surface a
// captcha actually needs to cover -- the native app itself isn't gated on
// solving a token, matching how app/api/subscribe+api.ts's
// `source: 'native' || !captchaToken` check already treats native calls.
export type SupportCaptchaProps = {
  apiEndpoint: string;
  onSolve: (token: string) => void;
  onReset?: () => void;
  onError?: (message: string) => void;
  resetKey?: number;
};

export default function SupportCaptcha(_props: SupportCaptchaProps) {
  return null;
}
