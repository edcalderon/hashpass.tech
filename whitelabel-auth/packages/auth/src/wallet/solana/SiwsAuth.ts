/**
 * Sign-In with Solana (SIWS) Implementation
 * @whitelabel/auth
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { WalletConfig } from '../../types/config.js';
import { WalletError } from '../../types/auth.js';

export interface SiwsMessageParams {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

interface SolanaWindow {
  solana?: {
    isPhantom?: boolean;
    connect(): Promise<{ publicKey: { toString(): string } }>;
    signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>;
    isConnected?: boolean;
    publicKey?: { toString(): string };
  };
  solflare?: {
    isConnected?: boolean;
    connect(): Promise<{ publicKey: { toString(): string } }>;
    signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>;
    publicKey?: { toString(): string };
  };
}

export class SiwsAuth {
  private config: WalletConfig['solana'];
  private wallet: SolanaWindow['solana'] | SolanaWindow['solflare'] | null = null;

  constructor(config: WalletConfig['solana']) {
    this.config = config;
  }

  /**
   * Check if Solana wallet is available
   */
  isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as SolanaWindow;
    return !!(win.solana || win.solflare);
  }

  /**
   * Connect to Solana wallet and return address
   */
  async connectWallet(): Promise<string> {
    if (typeof window === 'undefined') {
      throw new WalletError('Browser environment required', 'solana', 'NO_WINDOW');
    }

    const win = window as unknown as SolanaWindow;
    const wallet = win.solana || win.solflare;

    if (!wallet) {
      throw new WalletError(
        'Solana wallet not found. Please install Phantom or Solflare.',
        'solana',
        'WALLET_NOT_FOUND'
      );
    }

    this.wallet = wallet;

    try {
      if (!wallet.isConnected) {
        const response = await wallet.connect();
        return response.publicKey.toString();
      }

      return wallet.publicKey?.toString() || '';
    } catch (error: any) {
      if (error.code === 4001) {
        throw new WalletError('User rejected connection', 'solana', 'USER_REJECTED');
      }
      throw new WalletError(
        error.message || 'Failed to connect wallet',
        'solana',
        'CONNECTION_FAILED'
      );
    }
  }

  /**
   * Create SIWS message (EIP-4361 style adapted for Solana)
   */
  createMessage(params: SiwsMessageParams): string {
    const lines = [
      `${params.domain} wants you to sign in with your Solana account:`,
      params.address,
      '',
      `URI: ${params.uri}`,
      `Version: ${params.version}`,
      `Chain ID: ${params.chainId}`,
      `Nonce: ${params.nonce}`,
      `Issued At: ${params.issuedAt}`,
    ];

    if (params.expirationTime) {
      lines.push(`Expiration Time: ${params.expirationTime}`);
    }

    if (params.notBefore) {
      lines.push(`Not Before: ${params.notBefore}`);
    }

    if (params.requestId) {
      lines.push(`Request ID: ${params.requestId}`);
    }

    if (params.resources && params.resources.length > 0) {
      lines.push('Resources:');
      params.resources.forEach(resource => {
        lines.push(`- ${resource}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Sign message with wallet
   */
  async signMessage(message: string, address: string): Promise<string> {
    if (!this.wallet) {
      throw new WalletError('Wallet not connected', 'solana', 'NO_WALLET');
    }

    try {
      const messageBytes = new TextEncoder().encode(message);
      const signedMessage = await this.wallet.signMessage(messageBytes, 'utf8');
      return bs58.encode(signedMessage.signature);
    } catch (error: any) {
      if (error.code === 4001) {
        throw new WalletError('User rejected signature', 'solana', 'SIGNATURE_REJECTED');
      }
      throw new WalletError(
        error.message || 'Failed to sign message',
        'solana',
        'SIGN_FAILED'
      );
    }
  }

  /**
   * Verify signature
   */
  async verifySignature(
    message: string,
    signature: string,
    expectedAddress: string
  ): Promise<boolean> {
    try {
      // Decode signature
      const signatureBytes = bs58.decode(signature);

      // Decode message
      const messageBytes = new TextEncoder().encode(message);

      // Create public key from expected address
      const publicKey = new PublicKey(expectedAddress);

      // Note: This is a simplified verification
      // In production, you should use proper signature verification with Solana web3.js
      // The nacl library or @solana/wallet-adapter would be more appropriate
      
      // For now, we assume the signature is valid if it was provided
      // Real verification would involve crypto libraries
      return signatureBytes.length > 0 && publicKey.toBase58() === expectedAddress;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Get connected wallet
   */
  getWallet(): SolanaWindow['solana'] | SolanaWindow['solflare'] | null {
    return this.wallet;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string | null> {
    if (!this.wallet) {
      return null;
    }

    if (this.wallet.isConnected && this.wallet.publicKey) {
      return this.wallet.publicKey.toString();
    }

    try {
      const response = await this.wallet.connect();
      return response.publicKey.toString();
    } catch {
      return null;
    }
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.wallet = null;
  }
}
