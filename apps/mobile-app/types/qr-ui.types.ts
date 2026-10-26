import type { ExternalTicketQr } from "./external-ticket-qr.types";
import type { HashpassQrResolution } from "./qr-payload.types";

export type QrUiMode = "light" | "dark";

export interface ScanResultCardProps {
  resolution: HashpassQrResolution;
  mode: QrUiMode;
  /** Show request/boost usage, which door staff need but attendees do not. */
  showUsage?: boolean;
}

export interface ExternalTicketSheetProps {
  ticket: ExternalTicketQr;
  mode: QrUiMode;
  /** Called when the user is finished and wants to scan again. */
  onDone: () => void;
}

export interface ExternalClaimReviewProps {
  inspection: import("./ExternalTicketClaim.types").ExternalTicketClaimInspection;
  mode: QrUiMode;
  onApprove: () => void;
}

export type ExternalTicketSheetPhase = "form" | "submitted" | "claimed-elsewhere" | "reported";
