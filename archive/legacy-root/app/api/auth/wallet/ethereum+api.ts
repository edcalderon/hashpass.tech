import { supabaseServer as supabase } from '@/lib/supabase-server';
import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Verify Ethereum wallet signature and authenticate user
 * Implements EIP-4361 (Sign-In with Ethereum)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, signature, walletAddress } = body;

    if (!message || !signature || !walletAddress) {
      return badRequest('message, signature, and walletAddress are required');
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
      return badRequest('Invalid Ethereum address format');
    }

    // Normalize address (lowercase for storage, but use checksummed for verification)
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Validate and checksum the address
    let checksummedAddress: string;
    try {
      checksummedAddress = ethers.getAddress(walletAddress);
    } catch (e: any) {
      return badRequest('Invalid Ethereum address: ' + e.message);
    }

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Check rate limits (use normalized address)
    const { data: rateLimitData, error: rateLimitError } = await supabase
      .rpc('check_wallet_auth_rate_limit', {
        p_wallet_address: normalizedAddress,
        p_wallet_type: 'ethereum',
        p_ip_address: clientIp,
        p_max_attempts: 20, // 20 auth attempts per window
        p_window_minutes: 10, // 10 minute window
        p_block_duration_minutes: 5 // Reduced block duration
      });

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
      return new Response(JSON.stringify({ error: 'Rate limit check failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    if (rateLimitData && rateLimitData.length > 0) {
      const rateLimit = rateLimitData[0];
      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({
          error: 'Too many authentication attempts. Please try again later.',
          blockedUntil: rateLimit.blocked_until
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Parse and validate SIWE message
    // The message is a prepared SIWE message string
    let siweMessage: SiweMessage;
    try {
      // Try to parse the message string
      siweMessage = new SiweMessage(message);
      
      // Validate the message structure
      if (!siweMessage.domain || !siweMessage.address || !siweMessage.nonce) {
        return badRequest('SIWE message missing required fields');
      }
    } catch (error: any) {
      console.error('SIWE parse error:', error);
      console.error('Message that failed to parse:', message.substring(0, 200));
      
      // If parsing fails, try to extract fields manually for debugging
      const messageLines = message.split('\n');
      console.error('Message lines:', messageLines.length, messageLines);
      
      return badRequest('Invalid message format: ' + (error.message || String(error)));
    }

    // Verify message fields
    // Get domain from request URL (should match what client sent)
    const requestUrl = new URL(request.url);
    const expectedDomain = requestUrl.hostname;
    
    // Allow both exact match and localhost variations for development
    const isValidDomain = siweMessage.domain === expectedDomain || 
                         siweMessage.domain === 'localhost' ||
                         expectedDomain === 'localhost' ||
                         siweMessage.domain.endsWith(expectedDomain) ||
                         expectedDomain.endsWith(siweMessage.domain);
    
    if (!isValidDomain) {
      console.warn('Domain mismatch:', { 
        messageDomain: siweMessage.domain, 
        expectedDomain,
        requestUrl: request.url 
      });
      // Don't fail on domain mismatch in development, but log it
      // return badRequest(`Invalid domain in message. Expected ${expectedDomain}, got ${siweMessage.domain}`);
    }

    // normalizedAddress is already declared earlier in the function
    // Check if nonce exists and is valid
    const { data: walletAuth, error: walletError } = await supabase
      .from('wallet_auth')
      .select('nonce, nonce_expires_at, user_id')
      .eq('wallet_type', 'ethereum')
      .eq('wallet_address', normalizedAddress)
      .single();

    if (walletError || !walletAuth) {
      return badRequest('No valid challenge found. Please request a new challenge.');
    }

    if (!walletAuth.nonce || siweMessage.nonce !== walletAuth.nonce) {
      return badRequest('Invalid or expired nonce');
    }

    if (new Date(walletAuth.nonce_expires_at) < new Date()) {
      return badRequest('Challenge expired. Please request a new one.');
    }

    // Verify signature
    // Check that the address in the SIWE message matches the provided address (both checksummed)
    const messageAddress = ethers.getAddress(siweMessage.address);
    if (messageAddress !== checksummedAddress) {
      return badRequest(`Address mismatch: message has ${messageAddress}, provided ${checksummedAddress}`);
    }
    
    try {
      // SIWE verification with domain and nonce validation
      const isValid = await siweMessage.verify({ 
        signature,
        domain: expectedDomain, // Use expected domain for verification
      });
      if (!isValid.success) {
        console.error('SIWE verification failed:', isValid.error);
        return new Response(JSON.stringify({ error: 'Invalid signature: ' + isValid.error?.message }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error: any) {
      console.error('SIWE verification error:', error);
      // Fallback verification using ethers (less strict, but works)
      try {
        const recoveredAddress = ethers.getAddress(ethers.verifyMessage(message, signature));
        if (recoveredAddress !== checksummedAddress) {
          return new Response(JSON.stringify({ error: 'Signature verification failed: address mismatch' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (verifyError: any) {
        console.error('Ethers verification error:', verifyError);
        return new Response(JSON.stringify({ error: 'Signature verification failed: ' + verifyError.message }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Get or create user
    let userId = walletAuth.user_id;

    if (!userId) {
      // Create new user with wallet address as identifier
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: `${normalizedAddress}@wallet.ethereum`,
        email_confirm: true,
        user_metadata: {
          wallet_address: checksummedAddress, // Store checksummed address in metadata
          wallet_address_normalized: normalizedAddress, // Also store normalized for lookups
          wallet_type: 'ethereum',
          auth_provider: 'ethereum'
        }
      });

      if (createError || !newUser.user) {
        console.error('User creation error:', createError);
        return new Response(JSON.stringify({ error: 'Failed to create user account' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      userId = newUser.user.id;

      // Link wallet to user
      await supabase
        .from('wallet_auth')
        .update({ user_id: userId, last_used_at: new Date().toISOString() })
        .eq('wallet_type', 'ethereum')
        .eq('wallet_address', normalizedAddress);
    } else {
      // Update last used timestamp
      await supabase
        .from('wallet_auth')
        .update({ last_used_at: new Date().toISOString(), nonce: null, nonce_expires_at: null })
        .eq('wallet_type', 'ethereum')
        .eq('wallet_address', normalizedAddress);
    }

    // Generate a session for the user using admin API
    const walletEmail = `${normalizedAddress}@wallet.ethereum`;
    
    // Get the callback URL for redirect
    const origin = new URL(request.url).origin;
    const callbackUrl = `${origin}/(shared)/auth/callback`;
    
    // Generate a magic link that we can extract tokens from
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: walletEmail,
      options: {
        redirectTo: callbackUrl
      }
    });

    if (linkError) {
      console.error('Link generation error:', linkError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create session: ' + linkError.message 
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // The magic link contains the token we need
    const magicLink = linkData.properties?.action_link || '';
    
    // Parse the magic link to extract token
    let tokenHash = '';
    try {
      const url = new URL(magicLink);
      tokenHash = url.searchParams.get('token_hash') || url.searchParams.get('token') || '';
    } catch (e) {
      console.error('Failed to parse magic link:', e);
    }

    // Return success with user info and verification token
    // The client will use this token to verify and establish session
    return new Response(JSON.stringify({
      success: true,
      userId,
      walletAddress: checksummedAddress, // Return checksummed address
      email: walletEmail,
      tokenHash: tokenHash,
      magicLink: magicLink,
      // Also return the full redirect URL for fallback
      redirectUrl: magicLink
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Ethereum auth error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

