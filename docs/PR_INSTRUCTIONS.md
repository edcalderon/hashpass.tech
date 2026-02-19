# PR Instructions

## Commit Created ✅

Commit: `66434c7a4` - "fix: OAuth redirect issues, add multi-subdomain support, and Wazuh integration"

## Next Steps

### 1. Push to Remote

```bash
git push origin bsl2025
```

### 2. Create PR

Go to your GitHub repository and create a Pull Request from `bsl2025` to `main`.

**PR Title:**
```
fix: OAuth redirect issues, add multi-subdomain support, and Wazuh integration
```

**PR Description:**
Copy the contents from `PR_DESCRIPTION.md` or use the summary below:

---

## Summary

This PR fixes OAuth redirect issues, adds multi-subdomain support, and integrates Wazuh security logging.

### OAuth & Auth Improvements
- ✅ Fix Supabase OAuth redirect to `auth.hashpass.co/{subdomain}` issue
- ✅ Add immediate redirect detection in callback handler
- ✅ Remove hardcoded `bsl2025` references, support any `*.hashpass.tech` subdomain
- ✅ Enhance service worker to detect and handle incorrect redirects
- ✅ Update HTML template with dynamic subdomain extraction
- ✅ Add comprehensive documentation and quick fix guides

### Wazuh Integration
- ✅ Add Wazuh client for security event logging
- ✅ Add API endpoint for client-side Wazuh logging
- ✅ Add API middleware for automatic Wazuh logging
- ✅ Add comprehensive Wazuh integration documentation
- ✅ Fix missing timestamp properties in all WazuhEvent calls

### Files Changed
- `app/(shared)/auth/callback.tsx` - Immediate redirect + multi-subdomain support
- `app/+html.tsx` - Dynamic subdomain extraction
- `public/sw.js` - Incorrect redirect detection
- `SUPABASE_CONFIG.md` - Enhanced documentation
- `lib/wazuh-client.ts` - Wazuh integration
- `app/api/wazuh/log+api.ts` - Wazuh logging endpoint
- `lib/api-middleware.ts` - Automatic Wazuh logging
- New documentation files

### Testing
- ✅ OAuth redirects work correctly in development and production
- ✅ Works with any `*.hashpass.tech` subdomain automatically
- ✅ Auto-fixes incorrect Supabase redirects
- ✅ Wazuh events include required timestamp field

### Breaking Changes
None - this is a bug fix and enhancement.

---

### 3. Review Checklist

Before merging, verify:
- [ ] Supabase Dashboard configuration is updated (Site URL with `https://`)
- [ ] Redirect URLs include both development and production URLs
- [ ] Wazuh environment variables are configured (if using Wazuh)
- [ ] Tests pass
- [ ] Documentation is reviewed


