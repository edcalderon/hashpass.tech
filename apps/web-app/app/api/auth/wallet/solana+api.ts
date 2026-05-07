import { supabaseServer as supabase } from '@/lib/supabase-server';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Verify Solana wallet signature and authenticate user
 * Implements SIWS (Sign-In with Solana, EIP-4361 style)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, signature, walletAddress } = body;

    if (!message || !signature || !walletAddress) {
      return badRequest('message, signature, and walletAddress are required');
    }

    // Validate Solana address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return badRequest('Invalid Solana address format');
    }

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Check rate limits
    const { data: rateLimitData, error: rateLimitError } = await supabase
      .rpc('check_wallet_auth_rate_limit', {
        p_wallet_address: walletAddress,
        p_wallet_type: 'solana',
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

    // Parse message to extract nonce
    const messageLines = message.split('\n');
    const nonceMatch = message.match(/nonce:\s*([^\n]+)/);
    const nonce = nonceMatch ? nonceMatch[1].trim() : null;

    if (!nonce) {
      return badRequest('Nonce not found in message');
    }

    // Check if nonce exists and is valid
    const { data: walletAuth, error: walletError } = await supabase
      .from('wallet_auth')
      .select('nonce, nonce_expires_at, user_id')
      .eq('wallet_type', 'solana')
      .eq('wallet_address', walletAddress)
      .single();

    if (walletError || !walletAuth) {
      return badRequest('No valid challenge found. Please request a new challenge.');
    }

    if (!walletAuth.nonce || nonce !== walletAuth.nonce) {
      return badRequest('Invalid or expired nonce');
    }

    if (new Date(walletAuth.nonce_expires_at) < new Date()) {
      return badRequest('Challenge expired. Please request a new one.');
    }

    // Verify signature
    try {
      const publicKey = new PublicKey(walletAddress);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);

      // Verify using nacl (noble-ed25519 compatible)
      const { verify } = await import('@noble/ed25519');
      const publicKeyBytes = publicKey.toBytes();
      const isValid = await verify(signatureBytes, messageBytes, publicKeyBytes);

      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error: any) {
      console.error('Signature verification error:', error);
      return new Response(JSON.stringify({ error: 'Signature verification failed: ' + error.message }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Get or create user
    let userId = walletAuth.user_id;

    if (!userId) {
      // Create new user with wallet address as identifier
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: `${walletAddress}@wallet.solana`,
        email_confirm: true,
        user_metadata: {
          wallet_address: walletAddress,
          wallet_type: 'solana',
          auth_provider: 'solana'
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
        .eq('wallet_type', 'solana')
        .eq('wallet_address', walletAddress);
    } else {
      // Update last used timestamp
      await supabase
        .from('wallet_auth')
        .update({ last_used_at: new Date().toISOString(), nonce: null, nonce_expires_at: null })
        .eq('wallet_type', 'solana')
        .eq('wallet_address', walletAddress);
    }

    // Generate a session for the user using admin API
    const walletEmail = `${walletAddress}@wallet.solana`;
    
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
      walletAddress,
      email: walletEmail,
      tokenHash: tokenHash,
      magicLink: magicLink,
      // Also return the full redirect URL for fallback
      redirectUrl: magicLink
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Solana auth error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

