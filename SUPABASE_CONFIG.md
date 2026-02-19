# Supabase Authentication Configuration

## Problem
Supabase is redirecting to `auth.hashpass.co/bsl2025.hashpass.tech` instead of the correct callback URL. This happens when:
1. Site URL is not configured or is incorrect
2. Redirect URLs don't match what we're sending
3. Supabase uses `site_url` as a fallback when `redirect_to` doesn't match allowed URLs

## Solution: Configure Supabase Dashboard

### Step 1: Set Site URL
Go to: **Supabase Dashboard → Your Project → Authentication → URL Configuration**

**Site URL** (REQUIRED):
- For development: `http://localhost:8081`
- For production: `https://bsl2025.hashpass.tech`

⚠️ **CRITICAL**: This MUST be a complete URL with protocol (http:// or https://), NOT just a domain name.

### Step 2: Configure Redirect URLs
In the same section, under **Redirect URLs**, add ONLY these URLs (remove any with `(shared)`):

**For Development:**
```
http://localhost:8081/auth/callback
```

**For Production:**
```
https://bsl2025.hashpass.tech/auth/callback
```

⚠️ **IMPORTANT**: 
- Do NOT include URLs with `(shared)` - Expo Router removes route groups from URLs
- The actual URL path is `/auth/callback`, not `/(shared)/auth/callback`
- Wildcards are allowed, so you can use: `http://localhost:*/auth/callback` if needed

### Step 3: Verify Configuration

After saving, verify:
1. **Site URL** is set to a complete URL (not empty, not just a domain)
2. **Redirect URLs** contains your callback URLs without `(shared)`
3. Both development and production URLs are included

### Current Issue

The current configuration has:
- ❌ Site URL: Empty or incorrect
- ❌ Redirect URLs with `(shared)` which won't work

### Correct Configuration

**Site URL:**
```
https://bsl2025.hashpass.tech
```
(or `http://localhost:8081` for development)

**Redirect URLs:**
```
https://bsl2025.hashpass.tech/auth/callback
http://localhost:8081/auth/callback
```

## Why This Fixes The Problem

When Supabase processes OAuth redirects:
1. It checks if the `redirect_to` parameter matches an allowed URL
2. If it matches, it uses that URL
3. If it doesn't match OR if `redirect_to` is missing, it uses `site_url` + the path from `site_url`
4. If `site_url` is empty or just a domain (like `bsl2025.hashpass.tech`), it treats it as a relative path on the auth domain (`auth.hashpass.co/bsl2025.hashpass.tech`)

By setting:
- **Site URL** to a complete URL (`https://bsl2025.hashpass.tech`)
- **Redirect URLs** to match exactly what we send (`/auth/callback`)

Supabase will correctly redirect to your callback URL instead of using the auth domain.

## Development vs Production

**Important**: Supabase dashboard configuration is shared between development and production. You need to add BOTH URLs:

**Site URL**: Set this to your production URL (Supabase uses this as fallback)
```
https://bsl2025.hashpass.tech
```
⚠️ **CRITICAL**: Must include `https://` - if it's just `bsl2025.hashpass.tech`, Supabase treats it as a relative path!

**Redirect URLs**: Add BOTH development AND production URLs
```
http://localhost:8081/auth/callback
http://localhost:*/auth/callback  (wildcard for any port)
https://bsl2025.hashpass.tech/auth/callback
```

This way:
- When developing locally, `http://localhost:8081/auth/callback` will be allowed
- When in production, `https://bsl2025.hashpass.tech/auth/callback` will be allowed
- The site_url fallback will use production (which is fine since it's only used if redirect_to doesn't match)

## Debugging: Why redirect_to might not work

Even with correct Redirect URLs, Supabase might still use `site_url` as fallback if:

1. **The `redirect_to` parameter isn't being passed correctly** through the OAuth flow
   - Check browser console logs when starting OAuth - look for "redirect_to in URL" logs
   - The `redirect_to` must be in the OAuth URL that Supabase returns

2. **The `redirect_to` parameter gets lost** during OAuth provider redirect
   - OAuth providers (Google/Discord) might strip or modify the `redirect_to` parameter
   - Supabase then falls back to `site_url`

3. **Site URL is malformed** (most common issue)
   - If `site_url` is `bsl2025.hashpass.tech` (no protocol), Supabase treats it as relative
   - Result: `auth.hashpass.co/bsl2025.hashpass.tech` ❌
   - Fix: Set `site_url` to `https://bsl2025.hashpass.tech` ✅

## How to Verify

1. **Check Site URL in Dashboard**:
   - Go to: Authentication → URL Configuration
   - Site URL should be: `https://bsl2025.hashpass.tech` (with https://)
   - NOT: `bsl2025.hashpass.tech` (without protocol)

2. **Check Redirect URLs**:
   - Should include: `http://localhost:8081/auth/callback`
   - Should include: `https://bsl2025.hashpass.tech/auth/callback`

3. **Test the OAuth Flow**:
   - Open browser console
   - Start OAuth login
   - Look for logs showing the `redirect_to` parameter
   - After OAuth redirect, check if you land on the correct URL or `auth.hashpass.co/bsl2025.hashpass.tech`

