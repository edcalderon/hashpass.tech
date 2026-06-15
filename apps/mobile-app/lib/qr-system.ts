import { supabase } from './supabase';

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

      const { data, error } = await supabase
        .rpc('generate_pass_qr', {
          p_pass_id: passId,
          p_expires_in_minutes: expiresInMinutes,
          p_max_uses: maxUses,
        })
        .single();

      if (error) {
        console.error('Error generating pass QR:', error);
        return null;
      }

      // Get the generated QR code details
      const qrId = data as string;
      const qrCode = await this.getQRById(qrId);

      if (!qrCode) {
        return null;
      }

      return {
        qrId: qrCode.id,
        token: qrCode.token,
        qrData: qrCode.qr_data,
      };
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
      const { data, error } = await supabase
        .from('qr_codes')
        .select('*')
        .eq('id', qrId)
        .single();

      if (error) {
        console.error('Error getting QR by ID:', error);
        return null;
      }

      return data as QRCode;
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
      const { data, error } = await supabase
        .from('qr_codes')
        .select('*')
        .eq('token', token)
        .single();

      if (error) {
        console.error('Error getting QR by token:', error);
        return null;
      }

      return data as QRCode;
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
      const { data, error } = await supabase
        .from('qr_codes')
        .select('*')
        .eq('pass_id', passId)
        .eq('status', 'active')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error getting active QR for pass:', error);
        return null;
      }

      return data as QRCode | null;
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
      let query = supabase
        .from('qr_codes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting user QR codes:', error);
        return [];
      }

      return (data || []) as QRCode[];
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
      const { data, error } = await supabase
        .rpc('validate_and_use_qr', {
          p_token: token,
          p_scanner_user_id: scannerUserId || null,
          p_scanner_device_id: scannerDeviceId || null,
        })
        .single();

      if (error) {
        console.error('Error validating QR:', error);
        return {
          valid: false,
          status: 'invalid',
          message: 'Error validating QR code',
        };
      }

      return data as QRScanResult;
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
      const qr = await this.getQRByToken(token);

      if (!qr) {
        return {
          valid: false,
          status: 'invalid',
          message: 'QR code not found',
        };
      }

      // Check status
      if (qr.status === 'used') {
        return {
          valid: false,
          status: 'already_used',
          message: 'QR code has already been used',
          used_at: qr.used_at,
        };
      }

      if (qr.status === 'revoked') {
        return {
          valid: false,
          status: 'revoked',
          message: qr.revoked_reason || 'QR code has been revoked',
          revoked_at: qr.revoked_at,
        };
      }

      if (qr.status === 'suspended') {
        return {
          valid: false,
          status: 'suspended',
          message: 'QR code is suspended',
        };
      }

      if (qr.status === 'expired') {
        return {
          valid: false,
          status: 'expired',
          message: 'QR code has expired',
          expires_at: qr.expires_at,
        };
      }

      // Check expiration
      if (qr.expires_at && new Date(qr.expires_at) < new Date()) {
        return {
          valid: false,
          status: 'expired',
          message: 'QR code has expired',
          expires_at: qr.expires_at,
        };
      }

      // Check usage limit
      if (qr.usage_count >= qr.max_uses) {
        return {
          valid: false,
          status: 'limit_reached',
          message: 'QR code usage limit reached',
        };
      }

      return {
        valid: true,
        status: 'valid',
        message: 'QR code is valid',
        qr_data: qr.qr_data,
        display_data: qr.display_data,
        usage_count: qr.usage_count,
        max_uses: qr.max_uses,
      };
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
      const { data, error } = await supabase
        .rpc('revoke_qr_code', {
          p_token: token,
          p_admin_user_id: adminUserId,
          p_reason: reason || null,
        })
        .single();

      if (error) {
        console.error('Error revoking QR:', error);
        return false;
      }

      return data as boolean;
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
      const { data, error } = await supabase
        .rpc('suspend_qr_code', {
          p_token: token,
          p_admin_user_id: adminUserId,
        })
        .single();

      if (error) {
        console.error('Error suspending QR:', error);
        return false;
      }

      return data as boolean;
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
      const { data, error } = await supabase
        .rpc('reactivate_qr_code', {
          p_token: token,
          p_admin_user_id: adminUserId,
        })
        .single();

      if (error) {
        console.error('Error reactivating QR:', error);
        return false;
      }

      return data as boolean;
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
      const { data, error } = await supabase
        .from('qr_scan_logs')
        .select('*')
        .eq('qr_code_id', qrCodeId)
        .order('scanned_at', { ascending: false });

      if (error) {
        console.error('Error getting QR scan logs:', error);
        return [];
      }

      return data || [];
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
      console.log('📦 Generated QR payload (URL format):', url.substring(0, 100));
      return url;
    }

    // Default: JSON format (most reliable for scanning)
    const jsonPayload = JSON.stringify(payload);
    console.log('📦 Generated QR payload (JSON format):', jsonPayload);
    console.log('✅ Token included in payload:', cleanToken);
    
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
      // This is a placeholder for future wallet integration
      // For now, we'll create a QR with type 'wallet_transfer'
      const token = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 14).toUpperCase()}`;
      
      const qrData = {
        type: 'wallet_transfer',
        user_id: userId,
        wallet_address: walletAddress,
        amount: amount,
        currency: currency || 'VOI',
        timestamp: Date.now(),
      };

      const expiresInMinutes = options.expiresInMinutes || 60;

      const { data, error } = await supabase
        .from('qr_codes')
        .insert({
          token,
          qr_type: 'wallet_transfer',
          user_id: userId,
          associated_entity_id: walletAddress,
          qr_data: qrData,
          display_data: {
            wallet_address: walletAddress,
            amount: amount,
            currency: currency || 'VOI',
          },
          status: 'active',
          expires_at: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
          max_uses: options.maxUses || 1,
        })
        .select('id, token, qr_data')
        .single();

      if (error) {
        console.error('Error generating wallet transfer QR:', error);
        return null;
      }

      return {
        qrId: data.id,
        token: data.token,
        qrData: data.qr_data,
      };
    } catch (error) {
      console.error('Error in generateWalletTransferQR:', error);
      return null;
    }
  }
}

export const qrSystemService = new QRSystemService();
export default qrSystemService;

