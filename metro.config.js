const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const {
    wrapWithReanimatedMetroConfig,
  } = require('react-native-reanimated/metro-config');

const config = getDefaultConfig(__dirname);

// Web-only packages that should not be bundled on native
const webOnlyPackages = [
  'ethers',
  'siwe',
  '@solana/web3.js',
  'bs58',
  '@noble/ed25519',
  '@adraffy/ens-normalize',
  '@zxing/browser',
  '@zxing/library',
  'html5-qrcode',
];

// Store original resolveRequest if it exists
const originalResolveRequest = config.resolver?.resolveRequest;

// Add resolver configuration for ethers and related packages
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    // Ensure these modules can be resolved on web
    '@adraffy/ens-normalize': require.resolve('@adraffy/ens-normalize'),
  },
  // Add source extensions
  sourceExts: [...(config.resolver?.sourceExts || []), 'mjs', 'cjs'],
  // Custom resolveRequest to handle problematic imports
  resolveRequest: (context, moduleName, platform) => {
    // Handle qrcode trying to import server module - return empty module
    if (moduleName === './server' && context.originModulePath?.includes('qrcode')) {
      return { type: 'empty' };
    }
    
    // Block ZXing library imports on native platforms
    if (platform !== 'web') {
      // Check if this is a web-only package
      for (const pkg of webOnlyPackages) {
        if (moduleName === pkg || moduleName.startsWith(`${pkg}/`)) {
          return { type: 'empty' };
        }
      }
      
      // Block web scanner modules on native
      if (moduleName === './qr-scanner-web-fallback' || 
          moduleName === '../lib/qr-scanner-web-fallback' ||
          moduleName === './qr-scanner-web-html5' ||
          moduleName === '../lib/qr-scanner-web-html5' ||
          context.originModulePath?.includes('qr-scanner-web-fallback') ||
          context.originModulePath?.includes('qr-scanner-web-html5')) {
        return { type: 'empty' };
      }
      
      // Block any ZXing internal module resolution
      if (moduleName.includes('@zxing') || 
          context.originModulePath?.includes('@zxing')) {
        return { type: 'empty' };
      }
      
      // Block html5-qrcode on native
      if (moduleName === 'html5-qrcode' || 
          moduleName.startsWith('html5-qrcode/') ||
          context.originModulePath?.includes('html5-qrcode')) {
        return { type: 'empty' };
      }
    }
    
    // Use original resolveRequest if it exists, otherwise use default
    // Add safety checks to prevent undefined path errors
    try {
      if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform);
      }
      // Ensure context has required properties before calling resolveRequest
      if (context && typeof context.resolveRequest === 'function') {
        return context.resolveRequest(context, moduleName, platform);
      }
      // Fallback: return empty module if resolution fails
      console.warn(`[Metro] Could not resolve module: ${moduleName}`);
      return { type: 'empty' };
    } catch (error) {
      console.warn(`[Metro] Error resolving module ${moduleName}:`, error.message);
      return { type: 'empty' };
    }
  },
};

// Serve static files from public folder in development
// This middleware intercepts requests BEFORE Metro's asset resolver
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    const path = require('path');
    const fs = require('fs');
    
    // Return a new middleware that wraps the original
    // This middleware runs BEFORE Metro's asset resolver
    return (req, res, next) => {
      // CRITICAL: Handle /assets/ requests FIRST before Metro tries to resolve them
      // BUT: Allow Expo's asset requests (with unstable_path query param) to pass through to Metro
      if (req.url && req.url.startsWith('/assets/')) {
        // Check if this is an Expo asset request (has unstable_path query parameter)
        // These should be handled by Metro's default asset resolver
        const urlObj = new URL(req.url, 'http://localhost');
        if (urlObj.searchParams.has('unstable_path')) {
          // This is an Expo asset request - let Metro handle it
          return middleware(req, res, next);
        }
        
        // This is our custom asset request (speaker avatars, etc.)
        const contentTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.ttf': 'font/ttf',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
        };
        
        // Extract the path without query parameters for file system operations
        const assetPath = urlObj.pathname;
        
        // Try public folder first (e.g., /assets/speakers/avatars/... -> public/assets/speakers/avatars/...)
        const publicPath = path.join(__dirname, 'public', assetPath);
        if (fs.existsSync(publicPath)) {
          try {
            const stat = fs.statSync(publicPath);
            if (stat.isFile()) {
              const ext = path.extname(publicPath).toLowerCase();
              res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'application/octet-stream',
                'Content-Length': stat.size,
                'Cache-Control': 'public, max-age=31536000',
              });
              return fs.createReadStream(publicPath).pipe(res);
            }
          } catch (err) {
            // File exists but can't read it - fall through to 404
            console.warn(`[Metro] Error reading ${publicPath}:`, err.message);
          }
        }
        
        // Fallback: try assets folder (without /assets/ prefix)
        // e.g., /assets/speakers/avatars/... -> assets/speakers/avatars/...
        const fileName = assetPath.replace(/^\/assets\//, '');
        const assetsPath = path.join(__dirname, 'assets', fileName);
        if (fs.existsSync(assetsPath)) {
          try {
            const stat = fs.statSync(assetsPath);
            if (stat.isFile()) {
              const ext = path.extname(assetsPath).toLowerCase();
              res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'application/octet-stream',
                'Content-Length': stat.size,
                'Cache-Control': 'public, max-age=31536000',
              });
              return fs.createReadStream(assetsPath).pipe(res);
            }
          } catch (err) {
            // File exists but can't read it - fall through to 404
            console.warn(`[Metro] Error reading ${assetsPath}:`, err.message);
          }
        }
        
        // File not found - let Metro try to resolve it (might be an Expo asset)
        // Only return 404 for our specific asset paths (speaker avatars)
        if (assetPath.includes('/speakers/avatars/')) {
          // This is a speaker avatar - return 404 so Image component can handle fallback
          res.writeHead(404, {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache',
          });
          res.end('Not Found');
          return;
        }
        
        // For other /assets/ requests, let Metro handle them
        return middleware(req, res, next);
      }
      
      // Intercept /config/versions.json requests
      if (req.url && req.url === '/config/versions.json') {
        const configPath = path.join(__dirname, 'config', 'versions.json');
        if (fs.existsSync(configPath)) {
          const stat = fs.statSync(configPath);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Content-Length': stat.size,
          });
          return fs.createReadStream(configPath).pipe(res);
        }
      }
      
      // Intercept /api/config/versions requests (for API route compatibility)
      if (req.url && req.url === '/api/config/versions') {
        const configPath = path.join(__dirname, 'config', 'versions.json');
        if (fs.existsSync(configPath)) {
          const stat = fs.statSync(configPath);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Content-Length': stat.size,
          });
          return fs.createReadStream(configPath).pipe(res);
        }
      }
      
      // Intercept /assets/ requests BEFORE Metro tries to resolve them
      // This MUST return a response to prevent Metro from trying to resolve it as an asset
      if (req.url && req.url.startsWith('/assets/')) {
        const contentTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
        };
        
        // Try public folder first (e.g., /assets/speakers/avatars/... -> public/assets/speakers/avatars/...)
        const publicPath = path.join(__dirname, 'public', req.url);
        if (fs.existsSync(publicPath)) {
          try {
            const stat = fs.statSync(publicPath);
            if (stat.isFile()) {
              const ext = path.extname(publicPath).toLowerCase();
              console.log(`[Metro] ✅ Serving from public: ${req.url} -> ${publicPath}`);
              res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'application/octet-stream',
                'Content-Length': stat.size,
                'Cache-Control': 'public, max-age=31536000',
              });
              return fs.createReadStream(publicPath).pipe(res);
            }
          } catch (err) {
            // File exists but can't read it - fall through to 404
            console.warn(`[Metro] Error reading ${publicPath}:`, err.message);
          }
        }
        
        // Fallback: try assets folder (without /assets/ prefix)
        // e.g., /assets/speakers/avatars/... -> assets/speakers/avatars/...
        const fileName = req.url.replace(/^\/assets\//, '');
        const assetsPath = path.join(__dirname, 'assets', fileName);
        if (fs.existsSync(assetsPath)) {
          try {
            const stat = fs.statSync(assetsPath);
            if (stat.isFile()) {
              const ext = path.extname(assetsPath).toLowerCase();
              console.log(`[Metro] ✅ Serving from assets: ${req.url} -> ${assetsPath}`);
              res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'application/octet-stream',
                'Content-Length': stat.size,
                'Cache-Control': 'public, max-age=31536000',
              });
              return fs.createReadStream(assetsPath).pipe(res);
            }
          } catch (err) {
            // File exists but can't read it - fall through to 404
            console.warn(`[Metro] Error reading ${assetsPath}:`, err.message);
          }
        }
        
        // File not found - log for debugging
        console.log(`[Metro] ❌ Not found: ${req.url}`);
        console.log(`[Metro]   Tried public: ${publicPath} (exists: ${fs.existsSync(publicPath)})`);
        console.log(`[Metro]   Tried assets: ${assetsPath} (exists: ${fs.existsSync(assetsPath)})`);
        
        // Return 404 immediately so Image component can handle it
        // This is important for avatar fallback logic
        // MUST return here to prevent Metro from trying to resolve it
        res.writeHead(404, {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        });
        res.end('Not Found');
        return; // CRITICAL: Return here to prevent Metro from processing this request
      }
      // If not handled, pass to original middleware
      return middleware(req, res, next);
    };
  },
};

// Reduce memory usage
config.maxWorkers = 1; // Use single worker to reduce memory
config.cacheStores = config.cacheStores || [];

// Limit cache size to prevent memory issues
config.cacheVersion = '1.0';
config.resetCache = false;

// Optimize transformer for memory and production builds
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    ...config.transformer?.minifierConfig,
    keep_classnames: false,
    keep_fnames: false,
  },
  // Increase worker timeout for production builds
  workerTimeout: 60000,
  // Enable unstable_allowRequireContext for better module resolution
  unstable_allowRequireContext: true,
};

// Add additional resolver options for better module resolution
// Merge with existing resolver config to avoid conflicts
const existingAssetExts = config.resolver?.assetExts || [];
const newAssetExts = ['bin', 'txt', 'jpg', 'png', 'json', 'svg', 'gif', 'webp'];
const allAssetExts = [...new Set([...existingAssetExts, ...newAssetExts])];

config.resolver = {
  ...config.resolver,
  // Ensure resolverMainFields doesn't conflict with existing config
  resolverMainFields: config.resolver?.resolverMainFields || ['react-native', 'browser', 'main'],
  // Merge asset extensions
  assetExts: allAssetExts,
};

// Conditionally apply NativeWind and Reanimated based on environment
// During production export, these can cause issues with Metro bundler
const isProductionExport = process.env.NODE_ENV === 'production' || process.env.EXPO_PUBLIC_ENABLE_STATIC_EXPORT === 'true';
// Always use polyfill for react-native-reanimated when Metro is running in Node.js (SSR/export)
// This prevents errors during expo-router SSR rendering
const isNodeEnvironment = typeof window === 'undefined';

let finalConfig = config;

// Add resolver alias for react-native-reanimated during SSR/Node.js bundling
// This ensures Animated.createAnimatedComponent is available during expo-router SSR
if (isNodeEnvironment) {
  const polyfillPath = require.resolve('./config/reanimated-polyfill.js');
  config.resolver = {
    ...config.resolver,
    extraNodeModules: {
      ...config.resolver?.extraNodeModules,
      'react-native-reanimated': polyfillPath,
    },
  };
}

// Only wrap with Reanimated and NativeWind if not doing static export
// Skip Reanimated wrapping in Node.js environment (SSR/export) to use polyfill instead
if (!isProductionExport && !isNodeEnvironment) {
  try {
    finalConfig = wrapWithReanimatedMetroConfig(finalConfig);
  } catch (e) {
    console.warn('Failed to wrap with Reanimated config, continuing without it:', e.message);
  }
  finalConfig = withNativeWind(finalConfig, {
    input: './app/global.css',
  });
} else {
  // For production export or Node.js environment, apply NativeWind but skip Reanimated to use polyfill
  finalConfig = withNativeWind(finalConfig, {
    input: './app/global.css',
  });
}

module.exports = finalConfig;
