import { apiClient } from "./api-client";
import type {
  ExternalTicketClaimInput,
  ExternalTicketClaimResult,
} from "../types/ExternalTicketClaim.types";

export async function submitExternalTicketClaim(
  input: ExternalTicketClaimInput,
): Promise<ExternalTicketClaimResult> {
  const result = await apiClient.post(
    "/pass-ticket-claims",
    input,
    { skipEventSegment: true },
  );
  if (!result.success) throw new Error(result.error || "Unable to submit the ticket claim");
  const payload = result.data as { data?: ExternalTicketClaimResult } | ExternalTicketClaimResult;
  return ("data" in payload ? payload.data : payload) as ExternalTicketClaimResult;
}

export async function listExternalTicketClaims(): Promise<ExternalTicketClaimResult[]> {
  const result = await apiClient.get("/pass-ticket-claims", { skipEventSegment: true });
  if (!result.success) throw new Error(result.error || "Unable to load ticket claims");
  const payload = result.data as { data?: ExternalTicketClaimResult[] };
  return payload.data || [];
}
