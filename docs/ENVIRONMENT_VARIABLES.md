# Environment Variables Configuration

This document shows how to configure environment variables for the HashPass backend migration from Supabase to GCP Directus.

## Production Configuration

After deploying the GCP infrastructure and setting up `sso.hashpass.co`, update your environment variables:

### For Web Apps (Amplify, Netlify, Vercel, etc.)

```bash
# Backend Provider Configuration
EXPO_PUBLIC_BACKEND_PROVIDER=directus

# Directus Configuration (NEW)
EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co

# Keep existing Supabase (for database access only)
EXPO_PUBLIC_SUPABASE_URL=https://tgbdilebadmzqwubsijr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# API Configuration (unchanged - still using AWS Lambda)
EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api
```

### For Development

Create or update your `.env` file:

```bash
# Backend Provider - switch between providers
EXPO_PUBLIC_BACKEND_PROVIDER=directus  # or 'supabase' for testing

# Directus Configuration (local development)
EXPO_PUBLIC_DIRECTUS_URL=http://localhost:8055  # or https://sso.hashpass.co

# Keep Supabase for database
EXPO_PUBLIC_SUPABASE_URL=https://tgbdilebadmzqwubsijr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# API Configuration
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api  # or https://api.hashpass.tech/api
```

## Configuration Testing

### Test Provider Switching

1. **Test with Supabase** (existing):
   ```bash
   EXPO_PUBLIC_BACKEND_PROVIDER=supabase
   ```

2. **Test with Directus** (new):
   ```bash
   EXPO_PUBLIC_BACKEND_PROVIDER=directus
   EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co
   ```

### Verify Configuration

1. **Check Console Logs**:
   - Look for "Using backend provider: directus" or "Using backend provider: supabase"
   - Authentication logs should show the correct endpoints

2. **Test Authentication**:
   - Login/logout should work with both providers
   - Sessions should be maintained correctly

3. **Test Realtime**:
   - WebSocket connections should work with Directus

## Migration Strategy

### Phase 1: Parallel Testing (Current)
```bash
# Keep both providers available for testing
EXPO_PUBLIC_BACKEND_PROVIDER=supabase  # Default to existing
EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co  # Available for testing
```

### Phase 2: Switch to Directus
```bash
# Switch to Directus as primary
EXPO_PUBLIC_BACKEND_PROVIDER=directus
EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co
```

### Phase 3: Cleanup (Future)
- Remove Supabase Auth configuration
- Keep only database connection for migration completion

## Platform-Specific Configuration

### Amplify Console
1. Go to: App Settings → Environment variables
2. Add/Update the variables above
3. Redeploy your app

### Netlify
1. Go to: Site settings → Environment variables  
2. Add the new variables
3. Trigger a new deployment

### Vercel
1. Go to: Project → Settings → Environment Variables
2. Add for Production and Preview environments
3. Redeploy

### Local Development
1. Update `.env` file in project root
2. Restart your development server
3. Clear browser cache if needed

## Troubleshooting

### Provider Not Loading
- Check that `EXPO_PUBLIC_BACKEND_PROVIDER` is exactly `directus` or `supabase`
- Verify `EXPO_PUBLIC_DIRECTUS_URL` is set and accessible
- Check browser console for provider initialization errors

### Authentication Issues
- Verify Directus is running at the specified URL
- Check CORS configuration in Directus
- Ensure SSL certificate is valid for production

### Database Connection Issues
- Supabase database connection should remain unchanged
- Check that database migrations have been applied
- Verify RLS policies are compatible with both providers