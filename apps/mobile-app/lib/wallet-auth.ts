import { Platform } from 'react-native';

/**
 * Platform-aware wallet authentication
 * On web, uses wallet-auth-web.ts with full wallet support
 * On native, returns stubs that throw errors
 */

export const isWeb = Platform.OS === 'web';

/**
 * Check if Ethereum wallet (MetaMask, etc.) is available
 */
export const isEthereumWalletAvailable = (): boolean => {
  if (!isWeb || typeof window === 'undefined') return false;
  
  // Check standard location
  if ((window as any).ethereum) return true;
  
  // Check Firefox-specific locations
  if ((window as any).web3?.currentProvider) return true;
  if ((window as any).ethereum?.providers?.some((p: any) => p.isMetaMask)) return true;
  
  return false;
};

/**
 * Check if Solana wallet (Phantom, etc.) is available
 */
export const isSolanaWalletAvailable = (): boolean => {
  if (!isWeb || typeof window === 'undefined') return false;
  return !!(window as any).solana || !!(window as any).solflare;
};

// Platform-specific implementations
// On web, we'll dynamically import the web-only module
// This avoids Metro trying to bundle web dependencies on native
let webWalletAuth: any = null;

function getWebWalletAuth() {
  if (Platform.OS !== 'web') {
    throw new Error('Wallet authentication is only available on web');
  }
  
  if (typeof window === 'undefined') {
    throw new Error('Wallet authentication requires a browser environment');
  }
  
  if (!webWalletAuth) {
    try {
      // Use dynamic require that Metro can handle
      // The .web.ts extension tells Metro to only bundle this on web
      // We need to use a try-catch because Metro might try to analyze it
      if (typeof require !== 'undefined') {
        webWalletAuth = require('./wallet-auth.web');
      } else {
        throw new Error('require is not available');
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      // If it's a module not found error and we're on web, that's a real problem
      if (errorMsg.includes('Unable to resolve') || errorMsg.includes('Cannot find module')) {
        console.error('❌ Web wallet auth module not found:', errorMsg);
        throw new Error(
          'Wallet authentication dependencies are missing. ' +
          'Please run: npm install siwe ethers @solana/web3.js bs58'
        );
      }
      console.error('❌ Failed to load web wallet auth module:', errorMsg);
      console.error('Full error:', e);
      throw new Error(
        'Wallet authentication module failed to load. ' +
        'Please ensure you are on web platform. ' +
        'Error: ' + errorMsg
      );
    }
  }
  
  if (!webWalletAuth) {
    throw new Error('Web wallet auth module loaded but is empty');
  }
  
  return webWalletAuth;
}

/**
 * Connect to Ethereum wallet and get address
 */
export const connectEthereumWallet = async (): Promise<string> => {
  const webAuth = getWebWalletAuth();
  return webAuth.connectEthereumWallet();
};

/**
 * Sign message with Ethereum wallet
 */
export const signEthereumMessage = async (message: string, address: string): Promise<string> => {
  const webAuth = getWebWalletAuth();
  return webAuth.signEthereumMessage(message, address);
};

/**
 * Connect to Solana wallet and get address
 */
export const connectSolanaWallet = async (): Promise<string> => {
  const webAuth = getWebWalletAuth();
  return webAuth.connectSolanaWallet();
};

/**
 * Sign message with Solana wallet
 */
export const signSolanaMessage = async (message: string, address: string): Promise<string> => {
  const webAuth = getWebWalletAuth();
  return webAuth.signSolanaMessage(message, address);
};

/**
 * Authenticate with Ethereum wallet
 */
export const authenticateWithEthereum = async (): Promise<{ userId: string; email: string; walletAddress: string; tokenHash?: string | null; magicLink?: string | null; redirectUrl?: string | null }> => {
  const webAuth = getWebWalletAuth();
  return webAuth.authenticateWithEthereum();
};

/**
 * Authenticate with Solana wallet
 */
export const authenticateWithSolana = async (): Promise<{ userId: string; email: string; walletAddress: string; tokenHash?: string | null; magicLink?: string | null; redirectUrl?: string | null }> => {
  const webAuth = getWebWalletAuth();
  return webAuth.authenticateWithSolana();
};

