#!/usr/bin/env node
// Mints a real Supabase auth session for a dedicated demo user, without
// going through OTP email or Google OAuth — for recording authenticated app
// flows (dashboard, profile, etc.) where an agent has no real inbox or
// Google account to complete those flows by hand.
//
// Mirrors exactly what the app's own server-side OTP flow does
// (apps/mobile-app/app/api/auth/{otp,otp/verify}+api.ts): admin.generateLink()
// mints a token_hash server-side, then a direct GoTrue /verify call (not the
// supabase-js client, which injects PKCE fields GoTrue rejects for this
// path) exchanges it for a real session — the same two-step dance a human
// completes by reading a real email, just without the email round-trip.
//
// The resulting session is written as a Playwright storageState JSON
// (cookies: [], origins: [{origin, localStorage: [...]}]), ready to use
// directly with record-web-demo.mjs's --use-state flag — no browser
// automation needed to "log in", since this constructs the exact
// localStorage entry (`sb-<project-ref>-auth-token`) the Supabase JS client
// itself would have written after a real login.
//
// Usage:
//   node packages/tools/scripts/create-demo-session.mjs \
//     [--email video-studio-demo@hashpass.tech] \
//     [--out apps/video-studio/.recording-state/demo-session.json] \
//     [--base-url http://localhost:8081]
import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

function parseArgs(argv) {
  const args = {
    email: 'video-studio-demo@hashpass.tech',
    out: 'apps/video-studio/.recording-state/demo-session.json',
    'base-url': 'http://localhost:8081',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const flag = key.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[flag] = true;
    } else {
      args[flag] = next;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = dotenv.parse(readFileSync(resolve(REPO_ROOT, '.env')));

  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_KEY;
  // EXPO_PUBLIC_SUPABASE_URL is the dev project (fxgftanraszjjyeidvia) — its
  // matching service-role key is the _DEV-suffixed one, not the bare
  // SUPABASE_SERVICE_ROLE_KEY (that one 400s with "Invalid API key" here;
  // see the project's Prod Supabase key invalid note — the bare key is not
  // reliably the dev project's key).
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY_DEV || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY_DEV in .env');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {autoRefreshToken: false, persistSession: false},
  });

  console.log(`Ensuring demo user exists: ${args.email}`);
  // generateLink with type 'magiclink' creates the user if they don't exist
  // yet (same as a real first-time OTP sign-in would), and never sends an
  // email — it just returns the token server-side, exactly like the app's
  // own /api/auth/otp route does.
  const {data: linkData, error: linkError} = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: args.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('generateLink failed:', linkError?.message ?? 'no hashed_token in response');
    process.exit(1);
  }

  const authUserId = linkData.user.id;

  // A real first-time sign-in through the app's own API routes also calls
  // upsert_public_user_registry() (db/migrations/V004+) to create the
  // public.user row every downstream table's FK actually points at — going
  // straight through GoTrue like this skips that, so writes to tables like
  // user_profiles 400 with a foreign key violation ("Key (user_id)=(...) is
  // not present in table \"user\"") the first time this script runs for a
  // new email. That RPC itself assigns public.user.id independently of
  // auth.users.id, which does NOT satisfy those FKs (confirmed by testing
  // against this DB directly) — they need public.user.id to literally equal
  // the auth.users id, so upsert it directly instead of via the RPC.
  console.log('Syncing public.user registry row (id matched to the auth user)...');
  const {error: registryError} = await admin.from('user').upsert(
    {
      id: authUserId,
      email: args.email,
      provider: 'email',
      auth_provider: 'email',
      auth_user_id: authUserId,
      full_name: 'Video Studio Demo',
      role: 'user',
      status: 'active',
    },
    {onConflict: 'id'},
  );

  if (registryError) {
    console.error('public.user upsert failed:', registryError.message);
    process.exit(1);
  }

  const tokenHash = linkData.properties.hashed_token;

  // A brand-new user's first magiclink token doesn't always verify cleanly
  // as type 'magiclink' (GoTrue can reply "otp_expired" even immediately
  // after generateLink) — the app's own verify route
  // (app/api/auth/otp/verify+api.ts) hits exactly this and works around it
  // by trying several verification types in turn. Mirror that here.
  const verificationTypes = ['magiclink', 'signup', 'email'];
  let verified;
  let lastError;

  for (const type of verificationTypes) {
    console.log(`Exchanging token_hash for a real session via GoTrue /verify (type=${type})...`);
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({token_hash: tokenHash, type}),
    });

    if (verifyRes.ok) {
      verified = await verifyRes.json();
      break;
    }

    lastError = `${verifyRes.status} ${await verifyRes.text()}`;
  }

  if (!verified) {
    console.error(`GoTrue /verify failed for all types tried: ${lastError}`);
    process.exit(1);
  }

  if (!verified.access_token || !verified.user) {
    console.error('GoTrue /verify did not return a session:', JSON.stringify(verified));
    process.exit(1);
  }

  // This is exactly the shape @supabase/auth-js persists to storage after a
  // real client-side login (GoTrueClient#_saveSession) — see
  // node_modules/@supabase/auth-js/dist/module/GoTrueClient.js.
  const session = {
    access_token: verified.access_token,
    token_type: verified.token_type ?? 'bearer',
    expires_in: verified.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + (verified.expires_in ?? 3600),
    refresh_token: verified.refresh_token,
    user: verified.user,
  };

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: args['base-url'],
        localStorage: [{name: storageKey, value: JSON.stringify(session)}],
      },
    ],
  };

  const outPath = resolve(REPO_ROOT, args.out);
  mkdirSync(dirname(outPath), {recursive: true});
  writeFileSync(outPath, JSON.stringify(storageState, null, 2));

  console.log(`\nSaved demo session: ${outPath}`);
  console.log(`User: ${verified.user.id} (${verified.user.email})`);
  console.log(`Use it with: --use-state ${args.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
