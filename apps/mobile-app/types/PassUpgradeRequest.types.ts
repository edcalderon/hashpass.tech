import type { PassType } from "../lib/pass-system";

export type UpgradeablePassType = Exclude<PassType, "vip">;

export type PassUpgradeRequestResult = {
  requestId: string;
  status: "pending" | "already_pending";
  currentPassType: PassType;
  requestedPassType: Exclude<PassType, "general">;
};
