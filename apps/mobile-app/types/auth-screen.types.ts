export type SmsEnrollmentFlow = "registration" | "phone-link" | null;

export type SmsPhoneVerificationResponse = {
  success?: boolean;
  data?: { success?: boolean };
  error?: string;
};

export type ApiClientResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

export type PhoneEnrollmentStartResponse = {
  success?: boolean;
  data?: { success?: boolean; challengeId?: string };
  error?: string;
};

export type PhoneEnrollmentVerifyResponse = {
  success?: boolean;
  data?: { success?: boolean; last4?: string };
  error?: string;
};

export type TrustedPhonesResponse = {
  success?: boolean;
  data?: { phones?: Array<{ last4?: string; verifiedAt?: string }> };
  error?: string;
};
