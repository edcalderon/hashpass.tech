export type QrLinkStatus = "active" | "paused" | "expired" | "archived";

export interface QrVisualConfig {
  foreground: string;
  background: string;
  modules: "square" | "rounded";
  finderEye: "square" | "rounded";
  logo: boolean;
  errorCorrection: "M" | "Q" | "H";
  margin: number;
  logoSize: number;
}

export const DEFAULT_QR_VISUAL: QrVisualConfig = {
  foreground: "#071426",
  background: "#ffffff",
  modules: "square",
  finderEye: "rounded",
  logo: false,
  errorCorrection: "Q",
  margin: 4,
  logoSize: 18,
};

export interface QrLinkCampaign {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

/** What every qr-links route returns for a single link -- create/get/update all share this shape. */
export interface QrLink {
  id: string;
  ownerId: string;
  publicSlug: string;
  name: string;
  description?: string;
  destinationUrl: string;
  status: QrLinkStatus;
  startsAt?: string;
  expiresAt?: string;
  visualConfig: QrVisualConfig;
  campaign?: QrLinkCampaign;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  /** Total scans recorded so far. Present on list/get responses; absent immediately after create. */
  scanCount?: number;
  lastScanAt?: string;
}

export interface CreateQrLinkInput {
  name: string;
  destinationUrl: string;
  publicSlug?: string;
  description?: string;
  visualConfig?: Partial<QrVisualConfig>;
  campaign?: QrLinkCampaign;
  startsAt?: string | null;
  expiresAt?: string | null;
}

/** Every field is optional -- only the ones supplied are changed. Setting `status` drives the link's lifecycle (`active` <-> `paused`, or -> `archived`). */
export interface UpdateQrLinkInput {
  name?: string;
  publicSlug?: string;
  description?: string | null;
  destinationUrl?: string;
  visualConfig?: Partial<QrVisualConfig>;
  campaign?: QrLinkCampaign;
  startsAt?: string | null;
  expiresAt?: string | null;
  status?: QrLinkStatus;
}

export interface QrLinkAnalytics {
  windowDays: number;
  totalScans: number;
  humanScans: number;
  botScans: number;
  scansByDay: Record<string, number>;
  scansByDevice: Record<string, number>;
}

export interface QrSlugAvailability {
  available: boolean;
  slug: string;
}
