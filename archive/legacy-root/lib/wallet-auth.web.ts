/**
 * Web-only wallet authentication utilities
 * This file is only used on web platform to avoid Metro bundling issues
 */

import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { apiClient } from './api-client';

/**
 * Connect to Ethereum wallet and get address
 */
// Store the provider instance to ensure consistency (especially for Firefox)
let cachedEthereumProvider: any = null;

export const connectEthereumWallet = async (): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('Window object not available');
  }
  
  // Firefox may expose ethereum differently - check multiple possible locations
  let ethereum = (window as any).ethereum;
  
  // If not found, try Firefox-specific locations
  if (!ethereum) {
    // Firefox sometimes exposes it via web3
    if ((window as any).web3 && (window as any).web3.currentProvider) {
      ethereum = (window as any).web3.currentProvider;
    }
    // Or check if it's in a different property
    if (!ethereum && (window as any).ethereum?.providers) {
      // MetaMask might be in a providers array
      ethereum = (window as any).ethereum.providers?.find((p: any) => p.isMetaMask);
    }
  }
  
  if (!ethereum) {
    throw new Error('Ethereum wallet not found. Please install MetaMask or another Ethereum wallet.');
  }

  // Cache the provider for use in signing (important for Firefox)
  cachedEthereumProvider = ethereum;

  console.log('🔌 Requesting account access from MetaMask...');
  console.log('🌐 Browser:', navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other');
  console.log('📦 Provider cached for signing');
  
  try {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your MetaMask wallet.');
    }
    console.log('✅ Account connected:', accounts[0]);
    return accounts[0];
  } catch (error: any) {
    console.error('❌ MetaMask connection error:', error);
    if (error.code === 4001) {
      throw new Error('You rejected the connection request. Please try again and approve the connection.');
    }
    throw new Error('Failed to connect wallet: ' + (error.message || String(error)));
  }
};

/**
 * Sign message with Ethereum wallet
 */
export const signEthereumMessage = async (message: string, address: string): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('Window object not available');
  }

  // Get ethereum provider - prefer cached provider from connection (important for Firefox)
  let ethereum = cachedEthereumProvider;
  
  // If no cached provider, try to find it
  if (!ethereum) {
    ethereum = (window as any).ethereum;
    if (!ethereum) {
      if ((window as any).web3 && (window as any).web3.currentProvider) {
        ethereum = (window as any).web3.currentProvider;
      }
      if (!ethereum && (window as any).ethereum?.providers) {
        ethereum = (window as any).ethereum.providers?.find((p: any) => p.isMetaMask);
      }
    }
  }
  
  if (!ethereum) {
    throw new Error('Ethereum wallet not found');
  }

  // For Firefox, ensure we're using the MetaMask provider if multiple providers exist
  if ((window as any).ethereum?.providers && (window as any).ethereum.providers.length > 1) {
    const metaMaskProvider = (window as any).ethereum.providers.find((p: any) => p.isMetaMask);
    if (metaMaskProvider) {
      ethereum = metaMaskProvider;
      console.log('🔍 Using MetaMask provider from providers array');
    }
  }
  
  console.log('🔗 Using provider:', cachedEthereumProvider === ethereum ? 'cached' : 'fresh');
  
  console.log('🔐 Requesting signature from MetaMask...');
  console.log('   Address:', address);
  console.log('   Message length:', message.length);
  console.log('   Browser:', navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other');
  console.log('   Provider:', ethereum?.isMetaMask ? 'MetaMask' : 'Other');
  
  try {
    // Ensure we're using the correct address format
    const normalizedAddress = address.toLowerCase();
    
    // For Firefox, sometimes we need to ensure the provider is ready
    // Check if provider has the request method
    if (!ethereum.request) {
      throw new Error('Ethereum provider does not support request method');
    }
    
    // Firefox-specific: Sometimes need to wait a bit for MetaMask to be ready
    const isFirefox = navigator.userAgent.includes('Firefox');
    if (isFirefox) {
      // Longer delay for Firefox to ensure MetaMask popup system is ready
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log('🦊 Firefox detected - ensuring MetaMask is ready...');
      
      // In Firefox, ensure we're using the main ethereum provider (not a cached one)
      // Sometimes the cached provider doesn't trigger popups
      const mainProvider = (window as any).ethereum;
      if (mainProvider && mainProvider.isMetaMask) {
        ethereum = mainProvider;
        console.log('🔄 Using main MetaMask provider for Firefox');
      }
    }
    
    console.log('📤 Sending signature request to MetaMask...');
    console.log('   Method: personal_sign');
    console.log('   Params:', [message.substring(0, 50) + '...', normalizedAddress]);
    console.log('   Provider type:', ethereum.constructor?.name || 'Unknown');
    console.log('   Has request method:', typeof ethereum.request === 'function');
    console.log('   Is MetaMask:', ethereum.isMetaMask);
    
    // For Firefox, create a promise with timeout to detect if popup doesn't appear
    let signature: string;
    const signaturePromise = ethereum.request({
      method: 'personal_sign',
      params: [message, normalizedAddress],
    });
    
    // Add timeout for Firefox to detect if popup doesn't appear
    if (isFirefox) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Signature request timed out. Please check if MetaMask popup appeared. If not, try clicking the MetaMask extension icon.'));
        }, 10000); // 10 second timeout
      });
      
      try {
        signature = await Promise.race([signaturePromise, timeoutPromise]) as string;
      } catch (timeoutError: any) {
        if (timeoutError.message.includes('timed out')) {
          console.warn('⚠️ Signature request timed out - MetaMask popup may not have appeared');
          throw timeoutError;
        }
        throw timeoutError;
      }
    } else {
      signature = await signaturePromise;
    }
    
    console.log('✅ Signature received from MetaMask');
    return signature;
  } catch (error: any) {
    console.error('❌ MetaMask signature error:', error);
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
    
    // If standard request fails in Firefox, try alternative approach
    if (navigator.userAgent.includes('Firefox') && error.code !== 4001) {
      console.log('🔄 Trying alternative signature method for Firefox...');
      try {
        // Try with the address first (some providers expect different param order)
        const altSignature = await ethereum.request({
          method: 'personal_sign',
          params: [normalizedAddress, message],
        });
        console.log('✅ Signature received via alternative method');
        return altSignature;
      } catch (altError: any) {
        console.error('❌ Alternative method also failed:', altError);
      }
    }
    
    if (error.code === 4001) {
      throw new Error('User rejected the signature request');
    }
    if (error.message) {
      throw new Error('Signature failed: ' + error.message);
    }
    throw error;
  }
};

/**
 * Connect to Solana wallet and get address
 */
export const connectSolanaWallet = async (): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('Solana wallet not found. Please install Phantom or another Solana wallet.');
  }
  
  const solana = (window as any).solana || (window as any).solflare;
  if (!solana) {
    throw new Error('Solana wallet not found. Please install Phantom or another Solana wallet.');
  }
  
  try {
    if (!solana.isConnected) {
      await solana.connect();
    }
    return solana.publicKey.toString();
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error('User rejected the connection request');
    }
    throw error;
  }
};

/**
 * Sign message with Solana wallet
 */
export const signSolanaMessage = async (message: string, address: string): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('Solana wallet not found');
  }
  
  const solana = (window as any).solana || (window as any).solflare;
  if (!solana) {
    throw new Error('Solana wallet not found');
  }
  
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signedMessage = await solana.signMessage(messageBytes, 'utf8');
    return bs58.encode(signedMessage.signature);
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error('User rejected the signature request');
    }
    throw error;
  }
};

/**
 * Authenticate with Ethereum wallet
 */
export const authenticateWithEthereum = async (): Promise<{ userId: string; email: string; walletAddress: string; tokenHash?: string | null; magicLink?: string | null; redirectUrl?: string | null }> => {
  console.log('🚀 Starting Ethereum authentication...');
  
  // Step 1: Connect wallet
  console.log('📱 Step 1: Connecting to Ethereum wallet...');
  let walletAddress: string;
  try {
    walletAddress = await connectEthereumWallet();
    console.log('✅ Wallet connected:', walletAddress);
  } catch (error: any) {
    console.error('❌ Wallet connection failed:', error);
    throw new Error('Failed to connect wallet: ' + (error.message || String(error)));
  }

  // Step 2: Get challenge
  console.log('🔐 Step 2: Requesting challenge...');
  const challengeResult = await apiClient.post('/auth/wallet/challenge', {
    walletAddress,
    walletType: 'ethereum',
  });

  if (!challengeResult.success || !challengeResult.data) {
    console.error('❌ Challenge request failed:', challengeResult.error);
    throw new Error(challengeResult.error || 'Failed to get challenge');
  }

  const { nonce, message: challengeMessage } = challengeResult.data;
  console.log('✅ Challenge received, nonce:', nonce);

  // Step 3: Create SIWE message
  console.log('📝 Step 3: Creating SIWE message...');
  // Get checksummed address (EIP-55)
  const checksummedAddress = ethers.getAddress(walletAddress);
  
  // Use hostname for domain (without protocol)
  const domain = typeof window !== 'undefined' ? window.location.hostname : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  
  console.log('📍 Domain:', domain, 'Origin:', origin);
  
  // Create SIWE message with proper format
  const siweMessage = new SiweMessage({
    domain,
    address: checksummedAddress, // Use checksummed address
    statement: 'Sign in with Ethereum to HashPass',
    uri: origin,
    version: '1',
    chainId: 1, // Mainnet - adjust as needed
    nonce,
    issuedAt: new Date().toISOString(),
  });

  // Prepare the message string for signing
  const messageToSign = siweMessage.prepareMessage();
  console.log('📄 Message to sign (first 100 chars):', messageToSign.substring(0, 100));

  // Step 4: Sign message
  console.log('✍️ Step 4: Requesting signature from MetaMask...');
  console.log('⚠️ MetaMask should now prompt you to sign the message');
  let signature: string;
  try {
    signature = await signEthereumMessage(messageToSign, walletAddress);
    console.log('✅ Signature received:', signature.substring(0, 20) + '...');
  } catch (error: any) {
    console.error('❌ Signature failed:', error);
    if (error.code === 4001) {
      throw new Error('You rejected the signature request. Please try again and approve the signature.');
    }
    throw new Error('Failed to sign message: ' + (error.message || String(error)));
  }

  // Step 5: Verify signature and authenticate
  // Send the prepared message string and checksummed address
  const authResult = await apiClient.post('/auth/wallet/ethereum', {
    message: messageToSign, // Prepared SIWE message string
    signature,
    walletAddress: checksummedAddress, // Send checksummed address
  });

  if (!authResult.success || !authResult.data) {
    throw new Error(authResult.error || 'Authentication failed');
  }

  const authData = authResult.data;
  return {
    userId: authData.userId,
    email: authData.email,
    walletAddress: authData.walletAddress,
    tokenHash: authData.tokenHash || null,
    magicLink: authData.magicLink || null,
    redirectUrl: authData.redirectUrl || authData.magicLink || null
  };
};

/**
 * Authenticate with Solana wallet
 */
export const authenticateWithSolana = async (): Promise<{ userId: string; email: string; walletAddress: string; tokenHash?: string | null; magicLink?: string | null; redirectUrl?: string | null }> => {
  // Step 1: Connect wallet
  const walletAddress = await connectSolanaWallet();

  // Step 2: Get challenge
  const challengeResult = await apiClient.post('/auth/wallet/challenge', {
    walletAddress,
    walletType: 'solana',
  });

  if (!challengeResult.success || !challengeResult.data) {
    throw new Error(challengeResult.error || 'Failed to get challenge');
  }

  const { nonce, message: challengeMessage } = challengeResult.data;

  // Step 3: Create SIWS message (EIP-4361 style)
  const domain = typeof window !== 'undefined' ? window.location.hostname : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const now = new Date().toISOString();
  
  const messageToSign = `${domain} wants you to sign in with your Solana account:
${walletAddress}

URI: ${origin}
Version: 1
Chain ID: solana:mainnet-beta
Nonce: ${nonce}
Issued At: ${now}
Resources:
- ${origin}`;

  // Step 4: Sign message
  const signature = await signSolanaMessage(messageToSign, walletAddress);

  // Step 5: Verify signature and authenticate
  const authResult = await apiClient.post('/auth/wallet/solana', {
    message: messageToSign,
    signature,
    walletAddress,
  });

  if (!authResult.success || !authResult.data) {
    throw new Error(authResult.error || 'Authentication failed');
  }

  const authData = authResult.data;
  return {
    userId: authData.userId,
    email: authData.email,
    walletAddress: authData.walletAddress,
    tokenHash: authData.tokenHash || null,
    magicLink: authData.magicLink || null,
    redirectUrl: authData.redirectUrl || authData.magicLink || null
  };
};

/**
 * Check if Ethereum wallet is available
 */
export const isEthereumWalletAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check standard location
  if ((window as any).ethereum) return true;
  
  // Check Firefox-specific locations
  if ((window as any).web3?.currentProvider) return true;
  if ((window as any).ethereum?.providers?.some((p: any) => p.isMetaMask)) return true;
  
  return false;
};

/**
 * Check if Solana wallet is available
 */
export const isSolanaWalletAvailable = (): boolean => {
  return typeof window !== 'undefined' && (!!(window as any).solana || !!(window as any).solflare);
};

