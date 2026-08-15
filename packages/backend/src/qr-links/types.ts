export type QrLinkStatus = 'active' | 'paused' | 'expired' | 'archived';

export interface QrVisualConfig {
  foreground: string;
  background: string;
  modules: 'square' | 'rounded';
  finderEye: 'square' | 'rounded';
  logo: boolean;
  errorCorrection: 'M' | 'Q' | 'H';
  margin: number;
  logoSize: number;
}

export interface QrLinkCampaign {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

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
  scanCount?: number;
  lastScanAt?: string;
}

export const DEFAULT_QR_VISUAL: QrVisualConfig = {
  foreground: '#071426',
  background: '#ffffff',
  modules: 'square',
  finderEye: 'rounded',
  logo: false,
  errorCorrection: 'Q',
  margin: 4,
  logoSize: 18,
};
