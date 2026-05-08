/**
 * Wallet Authentication Manager
 * @whitelabel/auth
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { User, Session, AuthResult, WalletType } from '../types/auth.js';
import type { WalletConfig } from '../types/config.js';
import { WalletError, ProviderError } from '../types/auth.js';
import { SiweAuth } from './ethereum/SiweAuth.js';
import { SiwsAuth } from './solana/SiwsAuth.js';

interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: number;
}

export class WalletAuthManager {
  private supabase: SupabaseClient;
  private config: WalletConfig;
  private appConfig?: { name: string; url: string };
  private siweAuth?: SiweAuth;
  private siwsAuth?: SiwsAuth;

  constructor(
    supabase: SupabaseClient,
    config: WalletConfig,
    appConfig?: { name: string; url: string }
  ) {
    this.supabase = supabase;
    this.config = config;
    this.appConfig = appConfig;

    if (config.ethereum?.enabled) {
      this.siweAuth = new SiweAuth(config.ethereum);
    }

    if (config.solana?.enabled) {
      this.siwsAuth = new SiwsAuth(config.solana);
    }
  }

  /**
   * Authenticate with wallet (Ethereum or Solana)
   */
  async authenticate(type: WalletType): Promise<AuthResult> {
    switch (type) {
      case 'ethereum':
        return this.authenticateWithEthereum();
      case 'solana':
        return this.authenticateWithSolana();
      default:
        return {
          error: new WalletError(`Unsupported wallet type: ${type}`, type, 'UNSUPPORTED_WALLET'),
        };
    }
  }

  /**
   * Check if wallet is available
   */
  isWalletAvailable(type: WalletType): boolean {
    switch (type) {
      case 'ethereum':
        return this.siweAuth?.isAvailable() ?? false;
      case 'solana':
        return this.siwsAuth?.isAvailable() ?? false;
      default:
        return false;
    }
  }

  private async authenticateWithEthereum(): Promise<AuthResult> {
    if (!this.siweAuth) {
      return {
        error: new WalletError('Ethereum authentication not configured', 'ethereum', 'NOT_CONFIGURED'),
      };
    }

    try {
      // Step 1: Connect wallet and get address
      const address = await this.siweAuth.connectWallet();

      // Step 2: Get or create challenge
      const challenge = await this.getOrCreateChallenge(address, 'ethereum');

      // Step 3: Create SIWE message
      const domain = typeof window !== 'undefined' ? window.location.host : this.appConfig?.url || 'localhost';
      const origin = typeof window !== 'undefined' ? window.location.origin : this.appConfig?.url || 'http://localhost';
      
      const siweMessage = this.siweAuth.createMessage({
        domain,
        address,
        statement: `Sign in to ${this.appConfig?.name || 'App'} with Ethereum`,
        uri: origin,
        version: '1',
        chainId: this.config.ethereum?.chainId || 1,
        nonce: challenge.nonce,
        issuedAt: new Date().toISOString(),
      });

      // Step 4: Sign message
      const signature = await this.siweAuth.signMessage(siweMessage, address);

      // Step 5: Verify and authenticate
      const verified = await this.siweAuth.verifySignature(siweMessage, signature, address);
      if (!verified) {
        return {
          error: new WalletError('Signature verification failed', 'ethereum', 'INVALID_SIGNATURE'),
        };
      }

      // Step 6: Create or link Supabase user
      const user = await this.createOrLinkWalletUser({
        walletType: 'ethereum',
        address,
        signature,
        message: siweMessage.prepareMessage(),
      });

      // Step 7: Create session
      const session = await this.createWalletSession(user, 'ethereum', address);

      return { user, session };
    } catch (error) {
      return {
        error: new WalletError(
          error instanceof Error ? error.message : 'Ethereum authentication failed',
          'ethereum',
          'AUTH_FAILED'
        ),
      };
    }
  }

  private async authenticateWithSolana(): Promise<AuthResult> {
    if (!this.siwsAuth) {
      return {
        error: new WalletError('Solana authentication not configured', 'solana', 'NOT_CONFIGURED'),
      };
    }

    try {
      // Step 1: Connect wallet
      const address = await this.siwsAuth.connectWallet();

      // Step 2: Get challenge
      const challenge = await this.getOrCreateChallenge(address, 'solana');

      // Step 3: Create SIWS message
      const domain = typeof window !== 'undefined' ? window.location.host : this.appConfig?.url || 'localhost';
      const origin = typeof window !== 'undefined' ? window.location.origin : this.appConfig?.url || 'http://localhost';

      const message = this.siwsAuth.createMessage({
        domain,
        address,
        statement: `Sign in to ${this.appConfig?.name || 'App'} with Solana`,
        uri: origin,
        version: '1',
        chainId: this.config.solana?.network || 'mainnet-beta',
        nonce: challenge.nonce,
        issuedAt: new Date().toISOString(),
      });

      // Step 4: Sign message
      const signature = await this.siwsAuth.signMessage(message, address);

      // Step 5: Verify signature
      const verified = await this.siwsAuth.verifySignature(message, signature, address);
      if (!verified) {
        return {
          error: new WalletError('Signature verification failed', 'solana', 'INVALID_SIGNATURE'),
        };
      }

      // Step 6: Create or link user
      const user = await this.createOrLinkWalletUser({
        walletType: 'solana',
        address,
        signature,
        message,
      });

      // Step 7: Create session
      const session = await this.createWalletSession(user, 'solana', address);

      return { user, session };
    } catch (error) {
      return {
        error: new WalletError(
          error instanceof Error ? error.message : 'Solana authentication failed',
          'solana',
          'AUTH_FAILED'
        ),
      };
    }
  }

  private async getOrCreateChallenge(
    address: string,
    walletType: WalletType
  ): Promise<WalletChallenge> {
    // Generate nonce
    const nonce = this.generateNonce();
    const message = `Sign this message to authenticate with ${this.appConfig?.name || 'App'}. Nonce: ${nonce}`;
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store challenge in Supabase
    const { error } = await this.supabase
      .from('wallet_auth_challenges')
      .upsert({
        wallet_address: address,
        wallet_type: walletType,
        nonce,
        message,
        expires_at: new Date(expiresAt).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to create challenge: ${error.message}`);
    }

    return { nonce, message, expiresAt };
  }

  private async createOrLinkWalletUser(params: {
    walletType: WalletType;
    address: string;
    signature: string;
    message: string;
  }): Promise<User> {
    const { walletType, address } = params;

    // Check if wallet is already linked to a user
    const { data: existingWallet } = await this.supabase
      .from('wallet_auth_methods')
      .select('user_id')
      .eq('wallet_type', walletType)
      .eq('wallet_address', address)
      .single();

    if (existingWallet) {
      // Get existing user
      const { data: userData } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', existingWallet.user_id)
        .single();

      if (userData) {
        return this.mapUserProfile(userData);
      }
    }

    // Create new user
    const email = `${address}@${this.appConfig?.url?.replace(/^https?:\/\//, '') || 'wallet.local'}`;

    const { data: authData, error: authError } = await this.supabase.auth.signUp({
      email,
      password: this.generateSecurePassword(),
      options: {
        data: {
          wallet_type: walletType,
          wallet_address: address,
          auth_method: 'wallet',
        },
      },
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create user: ${authError?.message || 'Unknown error'}`);
    }

    // Create user profile
    const { error: profileError } = await this.supabase.from('user_profiles').insert({
      id: authData.user.id,
      email,
      role: 'authenticated',
      status: 'active',
      [walletType === 'ethereum' ? 'eth_address' : 'solana_address']: address,
    });

    if (profileError) {
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // Store wallet mapping
    await this.supabase.from('wallet_auth_methods').insert({
      user_id: authData.user.id,
      wallet_type: walletType,
      wallet_address: address,
      verified_at: new Date().toISOString(),
    });

    return {
      id: authData.user.id,
      email,
      role: 'authenticated',
      status: 'active',
      supabaseUid: authData.user.id,
      ...(walletType === 'ethereum' ? { ethereumAddress: address } : { solanaAddress: address }),
    };
  }

  private async createWalletSession(
    user: User,
    walletType: WalletType,
    address: string
  ): Promise<Session> {
    // Get Supabase session
    const { data: { session } } = await this.supabase.auth.getSession();

    if (!session) {
      throw new Error('Failed to create Supabase session');
    }

    return {
      user,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
      provider: 'supabase',
      supabaseSession: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000,
      },
      walletAuth: {
        type: walletType,
        address,
      },
    };
  }

  private mapUserProfile(data: Record<string, unknown>): User {
    return {
      id: data.id as string,
      email: (data.email as string) || '',
      firstName: data.first_name as string | undefined,
      lastName: data.last_name as string | undefined,
      avatar: data.avatar_url as string | undefined,
      role: (data.role as string) || 'authenticated',
      status: (data.status as 'active' | 'inactive' | 'pending') || 'active',
      createdAt: data.created_at as string | undefined,
      updatedAt: data.updated_at as string | undefined,
      ethereumAddress: data.eth_address as string | undefined,
      solanaAddress: data.solana_address as string | undefined,
      supabaseUid: data.id as string,
    };
  }

  private generateNonce(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
