import { apiClient } from "./api-client";
import type { PassType } from "./pass-system";
import type {
  PassUpgradeRequestResult,
  UpgradeablePassType,
} from "../types/PassUpgradeRequest.types";

export type { PassUpgradeRequestResult, UpgradeablePassType } from "../types/PassUpgradeRequest.types";

export const nextPassType = (
  passType: PassType,
): Exclude<PassType, "general"> | null => {
  if (passType === "general") return "business";
  if (passType === "business") return "vip";
  return null;
};

export async function requestPassUpgrade(input: {
  passId: string;
  eventId?: string;
  requestedPassType: Exclude<PassType, "general">;
  ticketReference?: string;
}): Promise<PassUpgradeRequestResult> {
  const response = await apiClient.post(
    "/pass-upgrade-requests",
    {
      passId: input.passId,
      eventId: input.eventId,
      requestedPassType: input.requestedPassType,
      ticketReference: input.ticketReference?.trim() || undefined,
    },
    { skipEventSegment: true },
  );

  if (!response.success) {
    throw new Error(response.error || "Unable to submit upgrade request");
  }

  const data = (response.data as { data?: PassUpgradeRequestResult })?.data;
  if (!data?.requestId || !data.status) {
    throw new Error("The upgrade request returned an empty response");
  }
  return data;
}
