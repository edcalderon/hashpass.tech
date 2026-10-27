export type ConfirmStatus = 'idle' | 'sending' | 'sent' | 'verifying';

export type InboxItemKind = 'unconfirmed-email' | 'email-confirmed' | 'link-invalid';

export type InboxItem = {
  kind: InboxItemKind;
  email?: string;
};

export type InboxInput = {
  ownerEmail: string | null;
  confirmedEmails: string[];
  linkConfirmedEmail: string | null;
  linkFailed: boolean;
};

export type ConfirmationPayload =
  | { action: 'send'; email: string; locale: string }
  | { action: 'verify-code'; email: string; code: string }
  | { action: 'verify-link'; token: string };

export type ConfirmationResult =
  | { ok: true; email: string }
  | { ok: false; errorKey: string };

export type InboxBellProps = {
  items: InboxItem[];
  ownerEmail: string | null;
  status: ConfirmStatus;
  errorKey: string | null;
  onSend: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
};
