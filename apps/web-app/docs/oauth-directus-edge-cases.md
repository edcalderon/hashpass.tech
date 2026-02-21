# Directus OAuth Authentication Edge Cases & Pitfalls

This document outlines common integration edge cases, permission misconfigurations, and silent failures when integrating Directus SSO/OAuth with modern frontend applications (like Expo Web/React Native). These details were discovered during staging deployments.

## 1. Missing `directus_users` Role Permissions (Error 403 / Silent Failure)

### The Issue
You successfully execute the entire Google OAuth handshake, obtain an access token, but the frontend throws a vague "Session Not Established" or login loop error.

### Why It Happens
By default, newly created Roles in Directus (like a base "User" role assigned to new SSO users) **do not have permission to read from the `directus_users` collection**.
When the frontend SDK successfully establishes the session, it immediately calls `GET /users/me` to fetch the user profile. Directus returns a `403 Forbidden` error because of empty role permissions. The frontend interprets this as an "invalid token" or "invalid session" and aggressively clears the session, completely hiding the actual 403 authorization error.

### The Fix
The default SSO/Auth role MUST be granted Read/Update permissions on `directus_users`:
1. In Directus Admin, go to **Settings > Roles & Policies**.
2. Select your base role (e.g. `User`).
3. Create a Policy (e.g., "User Profile Access").
4. Add permissions for `directus_users`:
   - **Read**: `{"id": {"_eq": "$CURRENT_USER"}}`
   - **Update**: `{"id": {"_eq": "$CURRENT_USER"}}`
5. Ensure the Policy has "App Access" enabled.

*Note: The `@hashpass/auth` library has been hardened to specifically trap `403 FORBIDDEN` errors during session lookup and explicitly broadcast a permissions-failure message rather than a generic 401.*

## 2. Cross-Domain Cookie Loss (Redirect URI Mismatch)

### The Issue
Directus traditionally relies on `SameSite=Lax` or `Strict` cookies to establish OAuth sessions. If the frontend app sits on a completely different domain (e.g., `blockchainsummit-dev.hashpass.lat` vs `sso-dev.hashpass.co`), the browser blocks Directus from writing the `refresh_token` session cookie during the OAuth cross-site 302 redirect callback.

### The Fix
To bypass the cross-domain limitation, we utilize a serverless `login+api.ts` proxy (AWS Lambda) that initiates and handles the Google OAuth callback server-side. It generates its own tokens/sessions and then redirects back to the frontend with the `access_token` securely appended as a URL `#hash` parameter. The frontend captures this hash and initializes the in-memory session.

**Pitfall:** This custom redirect URI (`https://api-dev.hashpass.tech/api/auth/oauth/google`) MUST be explicitly registered inside the Google Cloud Console under the "Authorized redirect URIs". If it isn't, Google will throw a `400: redirect_uri_mismatch` error immediately upon clicking "Sign in with Google".

## 3. Expo Router Race Conditions (False Redirect Loops)

### The Issue
When navigating back from an OAuth flow, Expo Router's root `_layout.tsx` component mounts immediately. If the layout guards check React state (like `isLoggedIn` from a `useAuth` hook) to verify authentication, there is a microsecond gap before the state fully updates from the callback endpoint. The guard mistakenly interprets this gap as "logged out" and violently redirects you back to `/auth` in an infinite loop.

### The Fix
Authentication guards MUST query the underlying singleton service synchronously before failing.
```typescript
// BAD: State lags behind the callback
if (!isLoggedIn) router.replace('/auth');

// GOOD: Verify against the active service synchronously
const actuallyAuthenticated = isLoggedIn || authService.isAuthenticated();
if (!actuallyAuthenticated) router.replace('/auth');
```
Make sure to check inner layouts as well (e.g. `/dashboard/_layout.tsx`), as Expo Router evaluates every nested layout incrementally and any layout missing the bypass will trigger a bounce.

## 4. Metro Bundler Dead-Code Elimination (API Lambda Bugs)

### The Issue
When deploying an Expo API route to AWS Lambda via `expo export -p web`, the Metro bundler aggressively strips out code chunks wrapped in static environment checks (e.g., `if (process.env.GOOGLE_CLIENT_ID)`). If the `GOOGLE_CLIENT_ID` isn't injected tightly at build time, Metro permanently obliterates the entire Google OAuth initialization flow from the production JavaScript bundle.

### The Fix
Avoid evaluating `process.env.*` directly inside `if()` statements if the variable might only be populated lazily or at runtime.

```typescript
// BAD (Metro will erase this code completely if it doesn't see the var at build time):
if (process.env.GOOGLE_CLIENT_ID) { ... do OAuth ... }

// GOOD (Metro cannot safely evaluate and eliminate this statically):
const config = () => ({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
const { clientId } = config();
if (clientId || process.env.NODE_ENV !== 'production') { ... do OAuth ... }
```
