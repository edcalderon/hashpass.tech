# Authentication Structure & Multi-Subdomain Support

## Why Two Auth Locations?

The auth routes are organized as follows:

### Actual Auth Routes (in `(shared)` group)
- `app/(shared)/auth.tsx` → URL: `/auth` (main auth screen)
- `app/(shared)/auth/callback.tsx` → URL: `/auth/callback` (OAuth callback handler)

**Note**: The `(shared)` is an Expo Router route group - it's for code organization and doesn't appear in URLs.

### Redirect Handlers (outside `(shared)`)
- `app/auth/index.tsx` → Handles `/auth/` (trailing slash redirect)
- `app/auth/callback/index.tsx` → Handles `/auth/callback/` (trailing slash redirect)

These only exist to handle trailing slash redirects and redirect to the actual routes in `(shared)`.

## Multi-Subdomain Support

The auth system now works with **any** `hashpass.tech` subdomain, not just `bsl2025`:

- ✅ `bsl2025.hashpass.tech`
- ✅ `event2026.hashpass.tech`
- ✅ `any-event.hashpass.tech`
- ✅ `localhost:8081` (development)

### How It Works

1. **Dynamic Origin Detection**: The code extracts the subdomain from:
   - Current window location (if on a hashpass.tech domain)
   - Path in incorrect redirects (e.g., `/bsl2025.hashpass.tech` → `https://bsl2025.hashpass.tech`)
   - localStorage (stored during OAuth flow)
   - Environment variables

2. **OAuth Redirect URL**: Built dynamically using `window.location.origin`, so it works for any subdomain:
   ```javascript
   const origin = window.location.origin; // e.g., https://event2026.hashpass.tech
   redirectUrl = `${origin}/auth/callback`;
   ```

3. **Incorrect Redirect Fix**: When Supabase redirects incorrectly to `auth.hashpass.co/{subdomain}.hashpass.tech`, the code:
   - Detects any hashpass.tech subdomain in the path
   - Extracts the subdomain dynamically
   - Redirects to the correct callback URL

## Files Updated for Multi-Subdomain Support

1. **`app/(shared)/auth/callback.tsx`**
   - Removed hardcoded `bsl2025.hashpass.tech`
   - Dynamic subdomain extraction from path
   - Uses current hostname if available

2. **`app/+html.tsx`**
   - Removed hardcoded `bsl2025.hashpass.tech` default
   - Dynamic origin detection from window location or path
   - Works with any hashpass.tech subdomain

3. **`public/sw.js`**
   - Removed hardcoded `bsl2025.hashpass.tech`
   - Dynamic subdomain extraction
   - Pattern matching for any hashpass.tech subdomain

## Supabase Configuration

For multi-subdomain support, configure Supabase Redirect URLs with wildcards:

```
http://localhost:*/auth/callback
https://*.hashpass.tech/auth/callback
```

Or add specific subdomains:
```
https://bsl2025.hashpass.tech/auth/callback
https://event2026.hashpass.tech/auth/callback
```

**Site URL** should be set to your primary production domain:
```
https://bsl2025.hashpass.tech
```

## Testing

To test with a new subdomain:

1. Deploy to the new subdomain (e.g., `event2026.hashpass.tech`)
2. Add the callback URL to Supabase Redirect URLs
3. Start OAuth flow - it should automatically use the correct callback URL
4. If Supabase redirects incorrectly, the auto-fix will redirect to the correct domain

## Future Subdomains

No code changes needed! The auth system will automatically:
- Detect the current subdomain
- Build correct redirect URLs
- Handle incorrect Supabase redirects
- Work with any `*.hashpass.tech` subdomain


