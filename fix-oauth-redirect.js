/**
 * Emergency script to fix OAuth redirect when stuck on auth.hashpass.co/bsl2025.hashpass.tech
 * 
 * INSTRUCTIONS:
 * 1. Open browser console (F12 or Right-click -> Inspect -> Console)
 * 2. Copy and paste ALL the code below (from the first line to the last line)
 * 3. Press Enter
 * 
 * This will redirect you to the correct callback URL with all your auth tokens preserved.
 * 
 * If you need to set the origin manually, uncomment and modify the line:
 * // const correctOrigin = 'http://localhost:8081';
 */

// Wrap in IIFE to avoid redeclaration errors
(function() {
  'use strict';
  
  const currentHost = window.location.host;
  const currentPath = window.location.pathname;
  const currentUrl = window.location.href;

  console.log('🔍 Checking redirect fix...');
  console.log('📍 Current host:', currentHost);
  console.log('📍 Current path:', currentPath);
  console.log('📍 Current URL (first 200 chars):', currentUrl.substring(0, 200));

  if (currentHost === 'auth.hashpass.co' && (currentPath.includes('hashpass.tech') || currentPath.startsWith('/bsl2025'))) {
    console.log('🔧 Fixing OAuth redirect...');
    console.log('❌ Detected incorrect Supabase redirect to:', currentPath);
    
    // Check if we have auth tokens in the hash
    const hashFragment = window.location.hash;
    if (!hashFragment || !hashFragment.includes('access_token')) {
      console.error('❌ No access_token found in hash fragment!');
      console.error('📍 Full hash:', hashFragment.substring(0, 200));
      console.error('💡 This script requires auth tokens in the URL hash. If tokens are missing, authentication may have failed.');
      return;
    }
    
    console.log('✅ Found access_token in hash fragment');
    console.log('📍 Hash length:', hashFragment.length);
    console.log('📍 Hash preview:', hashFragment.substring(0, 100) + '...');
    
    // Get stored origin or use default - handle localStorage errors gracefully
    let correctOrigin = 'http://localhost:8081';
    let storedOrigin = null;
    
    try {
      storedOrigin = localStorage.getItem('oauth_redirect_origin');
      if (storedOrigin) {
        correctOrigin = storedOrigin;
        console.log('✅ Using stored origin from OAuth flow:', correctOrigin);
      } else {
        console.log('⚠️ No stored origin found in localStorage');
        console.log('📍 Using default origin:', correctOrigin);
        console.log('💡 If this is wrong, you can set it manually:');
        console.log('   const correctOrigin = "http://localhost:YOUR_PORT";');
        console.log('   Then run the script again.');
      }
    } catch (e) {
      console.warn('⚠️ localStorage not available (cross-origin restriction)');
      console.log('📍 Using default origin:', correctOrigin);
      console.log('💡 You may need to set correctOrigin manually if default is wrong');
    }
    
    // Build redirect URL
    let redirectUrl = `${correctOrigin}/auth/callback`;
    console.log('🔧 Base redirect URL:', redirectUrl);
    
    // Try to get apikey from various sources
    // The apikey is needed for Supabase to process the callback correctly
    let apikey = '';
    try {
      // Try multiple sources for apikey
      apikey = (window as any).__SUPABASE_ANON_KEY__ || 
               (window as any).__EXPO_PUBLIC_SUPABASE_KEY__ ||
               (typeof localStorage !== 'undefined' && localStorage.getItem('supabase_anon_key')) ||
               (typeof localStorage !== 'undefined' && localStorage.getItem('EXPO_PUBLIC_SUPABASE_KEY')) ||
               '';
      
      // If still no apikey, try to extract from the hash if it's there
      if (!apikey && hashFragment) {
        try {
          const hashParams = new URLSearchParams(hashFragment.substring(1));
          apikey = hashParams.get('apikey') || '';
        } catch (e) {
          // Hash might not be URL-encoded params
        }
      }
      
      // If still no apikey, try to extract from query params
      if (!apikey && window.location.search) {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          apikey = urlParams.get('apikey') || '';
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not get apikey from localStorage or window:', e);
    }
    
    // Add apikey as query parameter if available (critical for custom auth domains)
    if (apikey) {
      redirectUrl += `?apikey=${encodeURIComponent(apikey)}`;
      console.log('✅ apikey added to redirect URL (length:', apikey.length, ')');
    } else {
      console.warn('⚠️ No apikey found - callback may fail!');
      console.warn('💡 You can set it manually before running:');
      console.warn('   const apikey = "your-supabase-anon-key-here";');
      console.warn('   Then run the script again.');
    }
    
    // Preserve hash fragment (contains all OAuth tokens - THIS IS CRITICAL)
    if (hashFragment) {
      redirectUrl += hashFragment;
      console.log('✅ Hash fragment preserved (', hashFragment.length, 'chars)');
    } else {
      console.error('❌ No hash fragment found - auth tokens are missing!');
      console.error('💡 Without tokens, authentication will fail.');
      return;
    }
    
    // Preserve query params from URL (not hash)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.forEach((value, key) => {
        if (key !== 'apikey') {
          const separator = redirectUrl.includes('?') ? '&' : '?';
          redirectUrl += `${separator}${key}=${encodeURIComponent(value)}`;
        }
      });
    } catch (e) {
      console.warn('⚠️ Could not preserve query params:', e);
    }
    
    console.log('🔧 Final redirect URL (first 300 chars):', redirectUrl.substring(0, 300));
    console.log('🔧 Full URL length:', redirectUrl.length);
    console.log('🔧 Has access_token:', redirectUrl.includes('access_token'));
    console.log('🔧 Has refresh_token:', redirectUrl.includes('refresh_token'));
    console.log('🚀 Redirecting now...');
    
    // Perform redirect
    try {
      window.location.replace(redirectUrl);
    } catch (e) {
      console.error('❌ Failed to redirect:', e);
      console.error('💡 Try manually navigating to:', redirectUrl.substring(0, 300) + '...');
    }
  } else {
    console.log('✅ Already on correct domain or not a redirect issue');
    console.log('📍 If you\'re still having issues, check:');
    console.log('   1. Are you on auth.hashpass.co?');
    console.log('   2. Does the path contain "hashpass.tech" or start with "/bsl2025"?');
    console.log('   3. Do you have access_token in the URL hash?');
  }
})();
