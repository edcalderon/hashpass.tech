/**
 * Sign-In with Ethereum (EIP-4361) Implementation
 * @whitelabel/auth
 */

import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import type { WalletConfig } from '../../types/config.js';
import { WalletError } from '../../types/auth.js';

export interface SiweMessageParams {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export class SiweAuth {
  private config: WalletConfig['ethereum'];
  private provider: ethers.BrowserProvider | null = null;
  private cachedProvider: any = null;

  constructor(config: WalletConfig['ethereum']) {
    this.config = config;
  }

  /**
   * Check if Ethereum wallet is available
   */
  isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    
    const ethereum = (window as any).ethereum;
    if (ethereum) return true;
    
    // Firefox-specific checks
    if ((window as any).web3?.currentProvider) return true;
    if ((window as any).ethereum?.providers?.some((p: any) => p.isMetaMask)) return true;
    
    return false;
  }

  /**
   * Connect to Ethereum wallet and return address
   */
  async connectWallet(): Promise<string> {
    if (typeof window === 'undefined') {
      throw new WalletError('Browser environment required', 'ethereum', 'NO_WINDOW');
    }

    // Get provider
    let ethereum = (window as any).ethereum;
    
    if (!ethereum && (window as any).web3?.currentProvider) {
      ethereum = (window as any).web3.currentProvider;
    }

    if (!ethereum) {
      throw new WalletError(
        'Ethereum wallet not found. Please install MetaMask or another wallet.',
        'ethereum',
        'WALLET_NOT_FOUND'
      );
    }

    // Cache provider for signing
    this.cachedProvider = ethereum;
    this.provider = new ethers.BrowserProvider(ethereum);

    try {
      // Request account access
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      
      if (!accounts || accounts.length === 0) {
        throw new WalletError('No accounts found', 'ethereum', 'NO_ACCOUNTS');
      }

      return accounts[0];
    } catch (error: any) {
      if (error.code === 4001) {
        throw new WalletError('User rejected connection', 'ethereum', 'USER_REJECTED');
      }
      throw new WalletError(
        error.message || 'Failed to connect wallet',
        'ethereum',
        'CONNECTION_FAILED'
      );
    }
  }

  /**
   * Create SIWE message
   */
  createMessage(params: SiweMessageParams): SiweMessage {
    return new SiweMessage({
      domain: params.domain,
      address: params.address,
      statement: params.statement,
      uri: params.uri,
      version: params.version,
      chainId: params.chainId,
      nonce: params.nonce,
      issuedAt: params.issuedAt,
      expirationTime: params.expirationTime,
      notBefore: params.notBefore,
      requestId: params.requestId,
      resources: params.resources,
    });
  }

  /**
   * Sign message with wallet
   */
  async signMessage(message: SiweMessage, address: string): Promise<string> {
    if (!this.provider) {
      // Try to reconnect
      await this.connectWallet();
    }

    if (!this.provider) {
      throw new WalletError('Provider not initialized', 'ethereum', 'NO_PROVIDER');
    }

    try {
      const signer = await this.provider.getSigner();
      const messageString = message.prepareMessage();
      
      const signature = await signer.signMessage(messageString);
      return signature;
    } catch (error: any) {
      if (error.code === 4001) {
        throw new WalletError('User rejected signature', 'ethereum', 'SIGNATURE_REJECTED');
      }
      throw new WalletError(
        error.message || 'Failed to sign message',
        'ethereum',
        'SIGN_FAILED'
      );
    }
  }

  /**
   * Verify signature
   */
  async verifySignature(
    message: SiweMessage,
    signature: string,
    expectedAddress: string
  ): Promise<boolean> {
    try {
      const messageString = typeof message === 'string' ? message : message.prepareMessage();
      
      // Recover address from signature
      const recoveredAddress = ethers.verifyMessage(messageString, signature);
      
      // Compare addresses (case-insensitive)
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Get current chain ID
   */
  async getChainId(): Promise<number> {
    if (!this.provider) {
      throw new WalletError('Provider not initialized', 'ethereum', 'NO_PROVIDER');
    }

    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  /**
   * Switch to a specific chain
   */
  async switchChain(chainId: number): Promise<void> {
    if (!this.cachedProvider) {
      throw new WalletError('Provider not initialized', 'ethereum', 'NO_PROVIDER');
    }

    try {
      await this.cachedProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (error: any) {
      if (error.code === 4902) {
        // Chain not added, try to add it
        throw new WalletError(
          'Chain not configured in wallet',
          'ethereum',
          'CHAIN_NOT_ADDED'
        );
      }
      throw new WalletError(
        error.message || 'Failed to switch chain',
        'ethereum',
        'CHAIN_SWITCH_FAILED'
      );
    }
  }

  /**
   * Get provider instance
   */
  getProvider(): ethers.BrowserProvider | null {
    return this.provider;
  }
}
