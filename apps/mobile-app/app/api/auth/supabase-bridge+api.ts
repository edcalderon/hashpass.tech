import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { ensureSupabaseAccountForEmail, issueSupabaseSessionBridge } from '@/lib/auth/supabase-admin-bridge';
import { syncPublicUserRegistry } from '@/lib/auth/public-user-registry';
import { getBetterAuthSessionUser } from '@/lib/server/better-auth';

// POST /api/auth/supabase-bridge — issues a one-time Supabase session bridge
// (a magic-link token_hash, consumed client-side via supabase.auth.verifyOtp)
// for the caller's OWN verified Better Auth session. Never trusts a
// client-supplied email — getBetterAuthSessionUser() verifies the Better
// Auth session cookie server-side and returns the email tied to that
// session.
//
// Deliberately NOT authenticateRequest() from @hashpass/auth: that routes by
// tenant hostname, and the core tenant's authProvider is still the stale
// 'directus' value (see AUTH_FLOW.md), so it would require a Bearer token
// and 401 every Better-Auth-only caller on hashpass.tech before ever
// checking their session cookie — this endpoint's only caller is a Better
// Auth session by construction, so it verifies that directly instead.
//
// This is the on-demand counterpart to the Supabase account bridge in
// lib/server/better-auth.ts's syncBetterAuthUser: that hook ensures the
// shadow auth.users row exists as soon as the account is created/updated,
// while this endpoint (called by the client right after a successful
// sign-in) re-ensures it and hands back a session bridge so the client can
// establish a real Supabase session alongside its Better Auth one.
export async function POST(request: Request) {
  const user = await getBetterAuthSessionUser(request);
  if (!user?.email) {
    return Response.json({ error: 'No Better Auth session found' }, { status: 401 });
  }

  const supabase = getSupabaseServerForRequest(request);

  try {
    const bridgedAccount = await ensureSupabaseAccountForEmail(supabase, {
      email: user.email,
      userMetadata: {
        auth_provider: 'better-auth',
        auth_bridge: 'supabase_bridge_endpoint',
        full_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
        better_auth_user_id: user.id,
      },
    });

    // Belt-and-braces: link the bridged Supabase uid into the public.user
    // registry's provider_ids.supabase, same as the better-auth.ts hook does.
    // resolveSupabaseIdentityForUser (resolve-notification-identity.ts, used
    // by admin/event-admin access checks) resolves a Better-Auth caller's
    // supabaseUserId purely from that field — without this, a caller who
    // reaches this endpoint before the hook ever ran (or whose hook run
    // failed) would get a working session bridge but still fail admin
    // checks, since the registry would have no supabase provider id on file.
    if (bridgedAccount?.id) {
      await syncPublicUserRegistry(request, {
        provider: 'better-auth',
        authUserId: user.id,
        email: user.email,
        providerIds: {
          'better-auth': user.id,
          supabase: bridgedAccount.id,
        },
      });
    }

    const bridge = await issueSupabaseSessionBridge(supabase, user.email);
    if (!bridge) {
      return Response.json({ error: 'Failed to issue Supabase session bridge' }, { status: 500 });
    }

    return Response.json(bridge);
  } catch (e) {
    console.error('[supabase-bridge] unexpected error:', e);
    return Response.json({ error: 'Failed to issue Supabase session bridge' }, { status: 500 });
  }
}
