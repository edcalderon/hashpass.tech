import { apiClient } from './api-client';

export type QRType = 'pass' | 'wallet_transfer' | 'access_code' | 'ticket';
export type QRStatus = 'active' | 'used' | 'expired' | 'revoked' | 'suspended';

export interface QRCode {
  id: string;
  token: string;
  qr_type: QRType;
  pass_id?: string;
  user_id: string;
  associated_entity_id?: string;
  qr_data: any;
  display_data: any;
  status: QRStatus;
  expires_at?: string;
  generated_at: string;
  used_at?: string;
  last_checked_at?: string;
  usage_count: number;
  max_uses: number;
  admin_notes?: string;
  revoked_by?: string;
  revoked_at?: string;
  revoked_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface QRScanResult {
  valid: boolean;
  status: 'valid' | 'invalid' | 'already_used' | 'expired' | 'revoked' | 'suspended' | 'limit_reached';
  message: string;
  qr_data?: any;
  display_data?: any;
  usage_count?: number;
  max_uses?: number;
  used_at?: string;
  expires_at?: string;
  revoked_at?: string;
}

export interface QRGenerationOptions {
  expiresInMinutes?: number;
  maxUses?: number;
  ipAddress?: string;
  deviceFingerprint?: string;
}

class QRSystemService {
  private unwrap<T>(payload: unknown): T | null {
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return ((payload as { data?: T }).data ?? null) as T | null;
    }
    return (payload as T | null) ?? null;
  }

  private async backend<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; params?: Record<string, unknown> } = {}) {
    const result = options.method === 'POST'
      ? await apiClient.post(path, options.body, { skipEventSegment: true, params: options.params })
      : await apiClient.get(path, { skipEventSegment: true, params: options.params });
    if (!result.success) throw new Error(result.error || 'QR service request failed');
    return this.unwrap<T>(result.data);
  }

  /**
   * Generate a dynamic QR code for a pass
   */
  async generatePassQR(
    passId: string,
    options: QRGenerationOptions = {}
  ): Promise<{ qrId: string; token: string; qrData: any } | null> {
    try {
      const expiresInMinutes = options.expiresInMinutes || 30;
      const maxUses = options.maxUses || 1;

      const qrCode = await this.backend<QRCode>('/qr/pass', {
        method: 'POST',
        body: { passId, expiresInMinutes, maxUses },
      });
      if (!qrCode) return null;
      return { qrId: qrCode.id, token: qrCode.token, qrData: qrCode.qr_data };
    } catch (error) {
      console.error('Error in generatePassQR:', error);
      return null;
    }
  }

  /**
   * Get QR code by ID
   */
  async getQRById(qrId: string): Promise<QRCode | null> {
    try {
      return await this.backend<QRCode>('/qr/lookup', { params: { id: qrId } });
    } catch (error) {
      console.error('Error in getQRById:', error);
      return null;
    }
  }

  /**
   * Get QR code by token
   */
  async getQRByToken(token: string): Promise<QRCode | null> {
    try {
      return await this.backend<QRCode>('/qr/lookup', { params: { token } });
    } catch (error) {
      console.error('Error in getQRByToken:', error);
      return null;
    }
  }

  /**
   * Get active QR codes for a pass
   */
  async getActiveQRForPass(passId: string): Promise<QRCode | null> {
    try {
      const rows = await this.backend<QRCode[]>('/qr/lookup', { params: { passId } });
      return rows?.find((qr) => qr.status === 'active') || null;
    } catch (error) {
      console.error('Error in getActiveQRForPass:', error);
      return null;
    }
  }

  /**
   * Get all QR codes for a user
   */
  async getUserQRCodes(userId: string, status?: QRStatus): Promise<QRCode[]> {
    try {
      const rows = await this.backend<QRCode[]>('/qr/lookup', { params: { owner: true } });
      return (rows || []).filter((qr) => qr.user_id === userId && (!status || qr.status === status));
    } catch (error) {
      console.error('Error in getUserQRCodes:', error);
      return [];
    }
  }

  /**
   * Validate and use QR code (prevents double spending)
   */
  async validateAndUseQR(
    token: string,
    scannerUserId?: string,
    scannerDeviceId?: string
  ): Promise<QRScanResult> {
    try {
      const data = await this.backend<QRScanResult>('/qr/validate', {
        method: 'POST',
        body: { token, scannerDeviceId, consume: true },
      });
      return data || { valid: false, status: 'invalid', message: 'Error validating QR code' };
    } catch (error) {
      console.error('Error in validateAndUseQR:', error);
      return {
        valid: false,
        status: 'invalid',
        message: 'Error validating QR code',
      };
    }
  }

  /**
   * Check QR validity without using it (for preview)
   */
  async checkQRValidity(token: string): Promise<QRScanResult> {
    try {
      const data = await this.backend<QRScanResult>('/qr/validate', {
        method: 'POST',
        body: { token, consume: false },
      });
      return data || { valid: false, status: 'invalid', message: 'Error checking QR code' };
    } catch (error) {
      console.error('Error in checkQRValidity:', error);
      return {
        valid: false,
        status: 'invalid',
        message: 'Error checking QR code',
      };
    }
  }

  /**
   * Revoke QR code (admin function)
   */
  async revokeQR(token: string, adminUserId: string, reason?: string): Promise<boolean> {
    try {
      const result = await apiClient.post('/qr/admin', { token, reason: reason || null }, { skipEventSegment: true });
      if (!result.success) return false;
      return Boolean((result.data as { success?: boolean })?.success);
    } catch (error) {
      console.error('Error in revokeQR:', error);
      return false;
    }
  }

  /**
   * Suspend QR code (admin function)
   */
  async suspendQR(token: string, adminUserId: string): Promise<boolean> {
    try {
      const result = await apiClient.post('/qr/admin/suspend', { token }, { skipEventSegment: true });
      if (!result.success) return false;
      return Boolean((result.data as { success?: boolean })?.success);
    } catch (error) {
      console.error('Error in suspendQR:', error);
      return false;
    }
  }

  /**
   * Reactivate QR code (admin function)
   */
  async reactivateQR(token: string, adminUserId: string): Promise<boolean> {
    try {
      const result = await apiClient.post('/qr/admin/reactivate', { token }, { skipEventSegment: true });
      if (!result.success) return false;
      return Boolean((result.data as { success?: boolean })?.success);
    } catch (error) {
      console.error('Error in reactivateQR:', error);
      return false;
    }
  }

  /**
   * Get QR scan logs for a QR code
   */
  async getQRScanLogs(qrCodeId: string): Promise<any[]> {
    try {
      const result = await apiClient.get('/qr/admin/logs', {
        skipEventSegment: true,
        params: { qr_code_id: qrCodeId },
      });
      if (!result.success) return [];
      return ((result.data as { data?: any[] })?.data || []) as any[];
    } catch (error) {
      console.error('Error in getQRScanLogs:', error);
      return [];
    }
  }

  /**
   * Generate QR code URL/payload for display
   * This creates a standard format that can be used for QR generation libraries
   */
  generateQRPayload(token: string, baseUrl?: string): string {
    // Validate token exists
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.error('❌ generateQRPayload: Invalid token provided:', token);
      throw new Error('Invalid token provided for QR generation');
    }

    // Ensure token is trimmed
    const cleanToken = token.trim();
    
    // Create payload with token - this is what gets encoded in the QR code
    const payload = {
      type: 'hashpass_qr',
      token: cleanToken,
      timestamp: Date.now(),
    };

    // If baseUrl is provided, use URL format
    if (baseUrl) {
      const url = `${baseUrl}/qr/verify?token=${encodeURIComponent(cleanToken)}`;
      return url;
    }

    // Default: JSON format (most reliable for scanning)
    const jsonPayload = JSON.stringify(payload);
    return jsonPayload;
  }

  /**
   * Generate wallet transfer QR (future-proof for crypto transfers)
   */
  async generateWalletTransferQR(
    userId: string,
    walletAddress: string,
    amount?: number,
    currency?: string,
    options: QRGenerationOptions = {}
  ): Promise<{ qrId: string; token: string; qrData: any } | null> {
    try {
      const expiresInMinutes = options.expiresInMinutes || 60;

      const data = await this.backend<{ id: string; token: string; qr_data: any }>('/qr/wallet', {
        method: 'POST',
        body: {
          walletAddress,
          amount,
          currency: currency || 'VOI',
          expiresInMinutes,
          maxUses: options.maxUses || 1,
        },
      });
      if (!data) return null;
      return { qrId: data.id, token: data.token, qrData: data.qr_data };
    } catch (error) {
      console.error('Error in generateWalletTransferQR:', error);
      return null;
    }
  }
}

export const qrSystemService = new QRSystemService();
export default qrSystemService;
