import type { WalletPass } from "../lib/pass-wallet";

export type PublicPassShare = {
  shareId: string;
  url: string;
  qrValue: string;
  expiresAt: string | null;
};

export type PassTransferResult = {
  requestId: string;
  status: "pending" | "confirmed" | "completed";
  expiresAt?: string;
};

export type PassShareModalProps = {
  pass: WalletPass;
  visible: boolean;
  onClose: () => void;
};

export type PassShareView = "options" | "qr" | "transfer";

export type PublicPassDetails = {
  eventId: string;
  passType: string;
  status: string;
};
