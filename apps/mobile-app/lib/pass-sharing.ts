import { apiClient } from "./api-client";
import type { PassTransferResult, PublicPassShare } from "../types/PassShareModal.types";

const unwrap = <T>(payload: unknown): T | null => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return ((payload as { data?: T }).data ?? null) as T | null;
  }
  return (payload as T | null) ?? null;
};

const requestOptions = { skipEventSegment: true } as const;

export async function createPublicPassShare(passId: string, eventId?: string): Promise<PublicPassShare> {
  const response = await apiClient.post(
    "/pass-shares",
    { passId, eventId },
    requestOptions,
  );
  if (!response.success) throw new Error(response.error || "Unable to create a public pass link");
  const share = unwrap<PublicPassShare>(response.data);
  if (!share?.url || !share.qrValue) throw new Error("The public pass link was incomplete");
  return share;
}

export async function requestPassTransfer(input: {
  passId: string;
  eventId?: string;
  recipientEmail: string;
}): Promise<PassTransferResult> {
  const response = await apiClient.post(
    "/pass-transfers",
    { action: "request", ...input },
    requestOptions,
  );
  if (!response.success) throw new Error(response.error || "Unable to start the ticket transfer");
  const result = unwrap<PassTransferResult>(response.data);
  if (!result?.requestId) throw new Error("The transfer request was incomplete");
  return result;
}
