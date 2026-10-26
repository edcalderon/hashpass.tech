export type HashpassQrKind =
  | "qr_token"
  | "hpass_id"
  | "pass_id"
  | "wallet"
  | "network"
  | "url"
  | "unknown";

export interface ParsedHashpassQrPayload {
  kind: HashpassQrKind;
  raw: string;
  token?: string;
  hpassId?: string;
  passId?: string;
  userId?: string;
  eventId?: string;
  network?: string;
  address?: string;
  label?: string;
  isValid: boolean;
}

export interface HashpassQrResolution {
  valid: boolean;
  kind: HashpassQrKind;
  message: string;
  eventId?: string;
  network?: string;
  address?: string;
  qr?: {
    id: string;
    type: string | null;
    status: string | null;
    expiresAt: string | null;
  };
  user?: {
    id: string;
    name: string | null;
    username: string | null;
    /** Present only when the viewer is an admin or manager of the pass's event. */
    email?: string | null;
  };
  pass?: {
    id: string;
    number: string | null;
    type: string | null;
    status: string | null;
    eventId: string;
    createdAt: string | null;
    updatedAt: string | null;
    requests: { used: number; max: number };
    boost: { used: number; max: number };
  };
}

export interface ResolvedQrRecord {
  id: string;
  qr_type?: string | null;
  pass_id?: string | null;
  display_data?: Record<string, unknown> | null;
  status?: string | null;
  expires_at?: string | null;
}
