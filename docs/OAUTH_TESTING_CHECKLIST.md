# HashPass OAuth Local Testing Checklist

## ✅ Pre-Testing Checklist

### System Status
- [ ] Node.js v22.22.0: `node --version`
- [ ] pnpm 9.15.0: `pnpm --version`
- [ ] Docker running: `docker ps`
- [ ] Directus container running: `docker ps | grep directus`
- [ ] Web app dev server running: `curl -I http://localhost:8081` (should return 200)

### Configuration
- [ ] Environment file: `cat apps/web-app/.env | grep DIRECTUS_URL` → Should be `http://localhost:8055`
- [ ] Directus .env: `grep AUTH_PROVIDERS apps/directus/.env` → Should be `AUTH_PROVIDERS=local,google`
- [ ] Directus running: `curl -I http://localhost:8055` (should return 200)
- [ ] Directus OAuth: `curl http://localhost:8055/auth | jq .` → Should show google provider

### API Endpoints
- [ ] Login endpoint: `curl -v http://localhost:8081/api/auth/oauth/login?provider=google` → 302 redirect to localhost:8055
- [ ] Callback endpoint: `curl -v http://localhost:8081/api/auth/oauth/callback` → 302 redirect (error expected)

---

## 🧪 Browser Testing Steps

### 1. Access Auth Page
```
[ ] Open: http://localhost:8081/auth
[ ] Verify: Page loads with "Sign in with Google" button
[ ] Verify: Page has email/password input fields
```

### 2. Google OAuth Login
```
[ ] Click: "Sign in with Google"
[ ] Verify: Redirected to Google signin page
[ ] Enter: Your Google email and password
[ ] Verify: Google asks for permissions (may be cached)
[ ] Click: "Allow" or "Continue"
```

### 3. OAuth Callback
```
[ ] Verify: Browser redirects back to app
[ ] Verify: No error message shown
[ ] Verify: URL is http://localhost:8081/(shared)/dashboard/explore
[ ] Verify: Page loads with dashboard content
```

### 4. Token Storage
```
[ ] Open: Browser DevTools (F12)
[ ] Click: Application → LocalStorage → http://localhost:8081
[ ] Verify: Key exists: '@hashpass/auth:tokens'
[ ] Verify: Value contains: 'access_token' and 'refresh_token'
[ ] Note: May also be in sessionStorage or cookies
```

### 5. Dashboard Navigation
```
[ ] Verify: Logged in indicator shows your email
[ ] Click: Different dashboard tabs
[ ] Verify: Navigation works correctly
[ ] Click: Profile or Favorites
[ ] Verify: Can access protected pages
```

### 6. Logout Test
```
[ ] Find: Logout button (usually in menu/profile)
[ ] Click: Logout
[ ] Verify: Redirected to /auth page
[ ] Verify: Clear cookies/localStorage notification (if any)
```

### 7. Re-login Test
```
[ ] Follow: Steps 2-5 again
[ ] Verify: OAuth flow works second time
[ ] Verify: Can log in without issues
```

---

## 🐛 Troubleshooting Checklist

### "Missing required parameter: client_id"
- [ ] Check Google OAuth credentials in `apps/directus/.env`
- [ ] Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- [ ] Restart Directus: `docker-compose restart directus` (in apps/directus)
- [ ] Wait 30 seconds for restart
- [ ] Try login again

### "Authorization denied - Access blocked"
- [ ] Check Google Console for correct OAuth credentials
- [ ] Verify redirect URIs are configured in Google Console:
  - [ ] `http://localhost:8055/auth/callback` (for Directus)
  - [ ] May also need staging/production URLs
- [ ] Wait 2-3 minutes for changes to propagate in Google system

### Redirects to /auth with error message
- [ ] Check browser console for errors (F12 → Console)
- [ ] Check Directus logs: `docker-compose logs -f directus` (in apps/directus)
- [ ] Check web app logs in terminal where you ran `pnpm run dev`
- [ ] Verify Directus is running: `curl http://localhost:8055/auth`

### Can't access Directus at localhost:8055
- [ ] Check if running: `docker ps | grep directus`
- [ ] If not running: `cd apps/directus && docker-compose up -d`
- [ ] Check logs: `docker-compose logs directus`
- [ ] Try port 8055: `curl -I http://localhost:8055`

### Web app stuck on loading
- [ ] Check browser console for errors
- [ ] Check terminal where `pnpm run dev` is running
- [ ] Look for error lines with 🔴 or ❌
- [ ] Restart dev server: Kill process and `pnpm run dev` again

### Tokens not stored in storage
- [ ] Check DevTools → Application → LocalStorage/SessionStorage
- [ ] Look for `@hashpass/auth:tokens` key
- [ ] If missing, OAuth callback may have failed
- [ ] Check browser console and Directus logs for errors

---

## 📊 Expected Results

### Successful OAuth Flow
```
Request: GET /auth
Response: 302 → /api/auth/oauth/login?provider=google
         ↓
Request: GET /api/auth/oauth/login?provider=google
Response: 302 → http://localhost:8055/auth/login?provider=google
         ↓
[User authenticates with Google]
         ↓
Directus processes OAuth
Response: 302 → http://localhost:8081/api/auth/oauth/callback
         ↓
Request: GET /api/auth/oauth/callback
Response: 302 → /(shared)/dashboard/explore
         ↓
[Tokens stored in localStorage]
         ↓
Dashboard loads ✅
```

### Error Scenarios (Expected Behavior)
```
Missing Google credentials:
  → OAuth login page shows "Missing required parameter: client_id"

Directus down:
  → Callback returns: 302 → /auth?error=oauth_failed&message=...

Invalid state/cookies:
  → Callback returns: error message in auth form

Network timeout:
  → Error message: "Network error. Please check your connection."
```

---

## 🔄 Testing Multiple Environments

### Switch to Local (already done)
```bash
./switch-env.sh local
# DIRECTUS_URL should be: http://localhost:8055
```

### Switch to Staging (if configured)
```bash
./switch-env.sh staging
# DIRECTUS_URL should be: https://sso-dev.hashpass.co
# Note: Manually test if you have staging environment set up
```

### Switch back to Local
```bash
./switch-env.sh local
# Back to: http://localhost:8055
```

---

## 📝 Test Results Template

**Date**: _______________  
**Tester**: _______________  
**Environment**: [ ] Local [ ] Staging [ ] Production  
**Browser**: [ ] Chrome [ ] Firefox [ ] Safari [ ] Edge  

### Test Results

1. OAuth Login Flow
   - [ ] Pass  [ ] Fail
   - Notes: _______________

2. Token Storage
   - [ ] Pass  [ ] Fail
   - Token found at: _______________
   - Notes: _______________

3. Dashboard Access
   - [ ] Pass  [ ] Fail
   - Notes: _______________

4. Logout
   - [ ] Pass  [ ] Fail
   - Notes: _______________

5. Re-login
   - [ ] Pass  [ ] Fail
   - Notes: _______________

**Overall Result**: [ ] All Pass [ ] Some Failed [ ] All Failed

**Issues Found**:
1. _______________
2. _______________
3. _______________

**Notes**: _______________

---

## 🎯 Success Criteria

You'll know OAuth is working correctly when:

✅ Click "Sign in with Google" → Redirected to Google login  
✅ Sign in with Google credentials → Redirected back to app  
✅ Dashboard loads with your email/profile shown  
✅ Token `access_token` is stored in localStorage  
✅ Can navigate dashboard pages  
✅ Logout clears tokens  
✅ Can re-login without issues  

---

## 📚 Quick Reference

| What | Command | Expected |
|------|---------|----------|
| Check Directus | `curl http://localhost:8055/auth \| jq .` | google provider |
| Check web app | `curl -I http://localhost:8081` | 200 OK |
| Test OAuth | Click auth button | → Google login |
| Check tokens | DevTools → Storage → LocalStorage | @hashpass/auth:tokens |
| View logs | Terminal where `pnpm run dev` runs | No errors |
| Directus logs | `docker-compose logs -f directus` | OAuth events |

---

## 🔗 Help & Resources

- Complete Guide: [LOCAL_OAUTH_TESTING.md](LOCAL_OAUTH_TESTING.md)
- Setup Summary: [OAUTH_LOCAL_TESTING_SUMMARY.md](OAUTH_LOCAL_TESTING_SUMMARY.md)
- Verification Report: [OAUTH_VERIFICATION_REPORT.md](OAUTH_VERIFICATION_REPORT.md)
- This Checklist: [OAUTH_TESTING_CHECKLIST.md](OAUTH_TESTING_CHECKLIST.md)

---

Good luck with testing! 🚀
