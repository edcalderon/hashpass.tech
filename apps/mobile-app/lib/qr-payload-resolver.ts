import { apiClient } from "./api-client";
import type {
  HashpassQrResolution,
  ParsedHashpassQrPayload,
} from "../types/qr-payload.types";

/** Resolve scanned identities through the authenticated backend boundary. */
export async function resolveHashpassQrPayload(
  payload: ParsedHashpassQrPayload,
): Promise<HashpassQrResolution> {
  const result = await apiClient.post(
    "/qr/resolve",
    payload,
    { skipEventSegment: true },
  );
  if (!result.success) {
    throw new Error(result.error || "Unable to resolve this QR code");
  }
  return result.data as HashpassQrResolution;
}
