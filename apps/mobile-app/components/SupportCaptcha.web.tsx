import React from "react";
import { CaptchaWidget } from "@hashpass/ui/CaptchaWidget";
import type { SupportCaptchaProps } from "./SupportCaptcha";

export default function SupportCaptcha({
  apiEndpoint,
  onSolve,
  onReset,
  onError,
  resetKey,
}: SupportCaptchaProps) {
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
