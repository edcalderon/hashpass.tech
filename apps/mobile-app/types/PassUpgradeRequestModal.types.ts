import type { WalletPass } from "../lib/pass-wallet";
import type { PassType } from "../lib/pass-system";

export type PassUpgradeRequestModalProps = {
  pass: WalletPass;
  requestedPassType: Exclude<PassType, "general">;
  visible: boolean;
  onClose: () => void;
};
