import React from "react";
import { CaptchaWidget } from "@hashpass/ui/CaptchaWidget";
import type { EventProposalCaptchaProps } from "./EventProposalCaptcha";

export default function EventProposalCaptcha({
  apiEndpoint,
  onSolve,
  onReset,
  onError,
  resetKey,
}: EventProposalCaptchaProps) {
  return (
    <CaptchaWidget
      apiEndpoint={apiEndpoint}
      onSolve={onSolve}
      onReset={onReset}
      onError={onError}
      resetKey={resetKey}
    />
  );
}
