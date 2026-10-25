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
  user?: {
    id: string;
    name: string | null;
    username: string | null;
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
