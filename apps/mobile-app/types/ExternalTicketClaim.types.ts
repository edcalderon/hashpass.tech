import type { PassType } from "../lib/pass-system";

export type ExternalTicketClaimStatus = "pending" | "validated" | "rejected" | "converted";

export type ExternalTicketClaimInput = {
  eventId: string;
  issuer?: string;
  ticketCode?: string;
  qrPayload?: string;
  requestedPassType: PassType;
  ticketMetadata?: Record<string, unknown>;
};

export type ExternalTicketClaimResult = {
  id: string;
  status: ExternalTicketClaimStatus;
  pass_id?: string | null;
};

export type ExternalTicketClaimInspection = {
  valid: boolean;
  status?: ExternalTicketClaimStatus | "unregistered";
  message?: string;
  claim?: {
    id: string;
    event_id: string;
    issuer: string;
    claimant_user_id: string;
    claimant_email?: string | null;
    ticket_code_last4: string;
    source_ticket_metadata: Record<string, unknown>;
    requested_pass_type: PassType;
    status: ExternalTicketClaimStatus;
    reviewer_note?: string | null;
    hashpass_pass_id?: string | null;
    submitted_at: string;
    reviewed_at?: string | null;
    converted_at?: string | null;
  };
};

/** A claim as listed in the admin review queue, with the claimant resolved. */
export type ExternalTicketClaimRequest = {
  id: string;
  event_id: string;
  issuer: string;
  claimant_user_id: string;
  claimant_email?: string | null;
  ticket_code_last4: string;
  source_qr_payload?: { format?: string } | null;
  requested_pass_type: PassType;
  status: ExternalTicketClaimStatus;
  reviewer_note: string | null;
  submitted_at: string;
};

export type ExternalTicketReportReason = "impersonation" | "stolen" | "duplicate" | "other";

export type ExternalTicketReportInput = {
  eventId: string;
  issuer?: string;
  ticketCode?: string;
  qrPayload?: string;
  reason?: ExternalTicketReportReason;
  details?: string;
};

/** A report as listed in the admin review queue. */
export type ExternalTicketReportRequest = {
  id: string;
  claim_id: string | null;
  event_id: string;
  issuer: string;
  ticket_code_last4: string;
  reason: ExternalTicketReportReason;
  details: string | null;
  status: "open" | "confirmed" | "dismissed";
  reviewer_note: string | null;
  created_at: string;
  reporter_email: string | null;
  claimant_email: string | null;
  claimant_user_id: string | null;
  claim_status: ExternalTicketClaimStatus | null;
};
