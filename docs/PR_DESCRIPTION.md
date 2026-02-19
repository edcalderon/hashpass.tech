# Fix OAuth Redirect Issues, Add Multi-Subdomain Support & Wazuh Integration

## Problem

### OAuth Redirect Issue
Supabase was redirecting OAuth callbacks to `auth.hashpass.co/{subdomain}.hashpass.tech` instead of the correct callback URL. This happened because:

1. Supabase's `site_url` configuration was malformed (missing protocol)
2. When `redirect_to` parameter didn't match allowed URLs, Supabase fell back to `site_url`
3. If `site_url` was just a domain (e.g., `bsl2025.hashpass.tech`), Supabase treated it as a relative path
4. Result: `auth.hashpass.co/bsl2025.hashpass.tech` ❌

### Wazuh Integration
Added comprehensive Wazuh security event logging integration for monitoring and security compliance.

## Solution

### 1. Immediate Redirect Fix
- Added immediate redirect detection in `auth/callback.tsx` that runs before React mounts
- Extracts subdomain from path dynamically (works with any `*.hashpass.tech` subdomain)
- Redirects to correct callback URL preserving all OAuth tokens

### 2. Multi-Subdomain Support
- Removed hardcoded `bsl2025.hashpass.tech` references
- Dynamic subdomain extraction using regex pattern matching
- Works with any `*.hashpass.tech` subdomain automatically
- No code changes needed for new subdomains

### 3. Service Worker Enhancement
- Added detection for incorrect Supabase redirects
- Returns HTML page with redirect script if incorrect redirect detected
- Notifies clients to redirect immediately

### 4. HTML Template Fix
- Updated redirect script in `+html.tsx` to extract subdomain dynamically
- Improved origin detection with multiple fallback methods
- Works with any hashpass.tech subdomain

### 5. Wazuh Integration
- Added `WazuhClient` class for sending security events to Wazuh Manager
- Added `/api/wazuh/log` endpoint for client-side event logging
- Added API middleware for automatic Wazuh logging on API requests
- Fixed missing `timestamp` properties in all `WazuhEvent` calls
- Comprehensive Wazuh integration documentation and examples

### 6. Documentation
- `SUPABASE_CONFIG.md`: Updated with debugging steps and multi-subdomain instructions
- `docs/AUTH_STRUCTURE.md`: Explains auth route structure and multi-subdomain support
- `docs/OAUTH_REDIRECT_FIX.md`: Quick fix guide for stuck redirects
- `docs/wazuh-integration-guide.md`: Complete Wazuh integration guide
- `public/oauth-fix-bookmarklet.js`: Console script for manual redirect fix

## Changes

### Modified Files
- `app/(shared)/auth/callback.tsx`: Immediate redirect detection + multi-subdomain support
- `app/+html.tsx`: Dynamic subdomain extraction in redirect script
- `public/sw.js`: Detection and handling of incorrect redirects
- `SUPABASE_CONFIG.md`: Enhanced documentation with debugging steps

### New Files
- `docs/AUTH_STRUCTURE.md`: Auth structure documentation
- `docs/OAUTH_REDIRECT_FIX.md`: Quick fix guide
- `docs/wazuh-integration-guide.md`: Complete Wazuh integration guide
- `docs/wazuh-integration-example.ts`: Wazuh usage examples
- `lib/wazuh-client.ts`: Wazuh API client
- `lib/api-middleware.ts`: API middleware for automatic Wazuh logging
- `app/api/wazuh/log+api.ts`: Wazuh logging API endpoint
- `public/oauth-fix-bookmarklet.js`: Manual redirect fix script

## Testing

1. **Development**: OAuth should redirect to `http://localhost:8081/auth/callback`
2. **Production**: OAuth should redirect to `https://bsl2025.hashpass.tech/auth/callback`
3. **Other Subdomains**: Works automatically with any `*.hashpass.tech` subdomain
4. **Incorrect Redirects**: Auto-fixes when Supabase redirects incorrectly

## Supabase Configuration Required

⚠️ **Important**: Update Supabase Dashboard configuration:

1. **Site URL**: Must be `https://bsl2025.hashpass.tech` (with `https://`)
2. **Redirect URLs**: Must include:
   - `http://localhost:*/auth/callback`
   - `https://bsl2025.hashpass.tech/auth/callback`

See `SUPABASE_CONFIG.md` for detailed instructions.

## Breaking Changes

None - this is a bug fix and enhancement.

## Future Subdomains

No code changes needed! The auth system automatically:
- Detects current subdomain
- Builds correct redirect URLs
- Handles incorrect Supabase redirects
- Works with any `*.hashpass.tech` subdomain

