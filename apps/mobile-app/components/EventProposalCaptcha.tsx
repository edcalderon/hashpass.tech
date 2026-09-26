export type EventProposalCaptchaProps = {
  apiEndpoint: string;
  onSolve: (token: string) => void;
  onReset?: () => void;
  onError?: (message: string) => void;
  resetKey?: number;
};

export default function EventProposalCaptcha(_props: EventProposalCaptchaProps) {
  return null;
}
