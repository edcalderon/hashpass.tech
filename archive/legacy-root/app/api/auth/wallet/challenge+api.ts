import { supabaseServer as supabase } from '@/lib/supabase-server';

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Generate a challenge (nonce) for wallet authentication
 * This endpoint is rate-limited to prevent abuse
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { walletAddress, walletType, ipAddress } = body;

    if (!walletAddress || !walletType) {
      return badRequest('walletAddress and walletType are required');
    }

    if (!['ethereum', 'solana'].includes(walletType)) {
      return badRequest('walletType must be "ethereum" or "solana"');
    }

    // Validate Ethereum address format
    if (walletType === 'ethereum' && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return badRequest('Invalid Ethereum address format');
    }

    // Validate Solana address format (base58, 32-44 chars)
    if (walletType === 'solana' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return badRequest('Invalid Solana address format');
    }

    // Check rate limits
    const clientIp = ipAddress || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    const { data: rateLimitData, error: rateLimitError } = await supabase
      .rpc('check_wallet_auth_rate_limit', {
        p_wallet_address: walletAddress.toLowerCase(),
        p_wallet_type: walletType,
        p_ip_address: clientIp,
        p_max_attempts: 30, // Allow 30 challenge requests per window
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
          error: 'Too many requests. Please try again later.',
          blockedUntil: rateLimit.blocked_until
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Generate a secure random nonce
    // SIWE parser requires alphanumeric nonces (no special characters like hyphens)
    // Use Web Crypto API (available in Edge/Expo Server runtime)
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const timestamp = Date.now().toString(36); // Base36 encoding for shorter timestamp
    const nonce = randomHex + timestamp; // Simple alphanumeric string
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store nonce in database (upsert)
    const { error: nonceError } = await supabase
      .from('wallet_auth')
      .upsert({
        wallet_type: walletType,
        wallet_address: walletAddress.toLowerCase(),
        nonce: nonce,
        nonce_expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'wallet_type,wallet_address',
        ignoreDuplicates: false
      });

    if (nonceError) {
      console.error('Nonce storage error:', nonceError);
      return new Response(JSON.stringify({ error: 'Failed to generate challenge' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      nonce,
      message: `Sign this message to authenticate with ${walletType === 'ethereum' ? 'Ethereum' : 'Solana'}: ${nonce}`,
      expiresAt: expiresAt.toISOString()
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Challenge generation error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

