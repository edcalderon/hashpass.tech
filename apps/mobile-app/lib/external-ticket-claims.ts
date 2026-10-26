import { apiClient } from "./api-client";
import type {
  ExternalTicketClaimInput,
  ExternalTicketClaimResult,
  ExternalTicketReportInput,
} from "../types/ExternalTicketClaim.types";

export async function submitExternalTicketClaim(
  input: ExternalTicketClaimInput,
): Promise<ExternalTicketClaimResult> {
  const result = await apiClient.post(
    "/pass-ticket-claims",
    input,
    { skipEventSegment: true },
  );
  if (!result.success) {
    // Carry the HTTP status so callers can tell "already claimed" (409) apart.
    throw Object.assign(new Error(result.error || "Unable to submit the ticket claim"), { status: result.status });
  }
  const payload = result.data as { data?: ExternalTicketClaimResult } | ExternalTicketClaimResult;
  return ("data" in payload ? payload.data : payload) as ExternalTicketClaimResult;
}

export async function listExternalTicketClaims(): Promise<ExternalTicketClaimResult[]> {
  const result = await apiClient.get("/pass-ticket-claims", { skipEventSegment: true });
  if (!result.success) throw new Error(result.error || "Unable to load ticket claims");
  const payload = result.data as { data?: ExternalTicketClaimResult[] };
  return payload.data || [];
}

/** Flag an original ticket that someone else has claimed. Only queues a review. */
export async function reportExternalTicket(input: ExternalTicketReportInput): Promise<void> {
  const result = await apiClient.post("/pass-ticket-reports", input, { skipEventSegment: true });
  if (!result.success) throw new Error(result.error || "Unable to submit the ticket report");
}
