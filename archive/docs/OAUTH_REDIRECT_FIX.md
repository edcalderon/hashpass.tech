# OAuth Redirect Fix - Quick Guide

> Historical note: this guide was written for the older Supabase redirect issue. The current production Google sign-in flow is documented in [AUTH_FLOW.md](AUTH_FLOW.md).
> Current redirect helpers preserve the hash fragment only and do not append an `apikey` query string.

## Problem

You're stuck on: `https://auth.hashpass.co/bsl2025.hashpass.tech#access_token=...`

This happened because the older Supabase flow used the `site_url` as a relative path instead of an absolute URL.

## Immediate Fix (Run in Browser Console)

If you're stuck on the incorrect redirect page, open your browser console (F12) and run:

```javascript
(function() {
  const path = window.location.pathname;
  const hash = window.location.hash;
  const match = path.match(/([a-z0-9-]+\.hashpass\.tech)/i);
  if (match && hash.includes('access_token')) {
    const origin = 'https://' + match[1];
    const url = origin + '/auth/callback' + hash;
    console.log('Redirecting to:', url.substring(0, 200));
    window.location.replace(url);
  }
})();
```

Or use the full script from: `public/oauth-fix-bookmarklet.js`

## Permanent Fix

### 1. Check Supabase Dashboard

Go to: **Supabase Dashboard → Your Project → Authentication → URL Configuration**

### 2. Verify Site URL

**Site URL** must be:
```
https://bsl2025.hashpass.tech
```

⚠️ **CRITICAL**: Must include `https://` - if it's just `bsl2025.hashpass.tech`, Supabase treats it as a relative path!

### 3. Verify Redirect URLs

**Redirect URLs** must include:
```
http://localhost:8081/auth/callback
http://localhost:*/auth/callback
https://bsl2025.hashpass.tech/auth/callback
```

### 4. Save and Test

After saving, try OAuth login again. The redirect should work correctly.

## Why This Happens

1. Your code sends: `http://localhost:8081/auth/callback` (correct)
2. Supabase validates it against Redirect URLs
3. If validation fails OR `redirect_to` parameter is lost, Supabase uses `site_url` as fallback
4. If `site_url` is `bsl2025.hashpass.tech` (no protocol), Supabase treats it as relative
5. Result: `auth.hashpass.co/bsl2025.hashpass.tech` ❌

## Prevention

- Always set **Site URL** with full protocol: `https://bsl2025.hashpass.tech`
- Add all possible Redirect URLs (development + production)
- Use wildcards for localhost: `http://localhost:*/auth/callback`
- Do not pass the anon key through the callback URL; the app shell resolves public Supabase values from `window.__HASHPASS_RUNTIME__`.

## Multi-Subdomain Support

The code now automatically extracts the subdomain from the path, so it works with:
- `bsl2025.hashpass.tech`
- `event2026.hashpass.tech`
- Any `*.hashpass.tech` subdomain

No code changes needed for new subdomains!
