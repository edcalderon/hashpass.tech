import { readFileSync } from 'fs';
import { join } from 'path';
import { compareAppVersions, getRuntimeEnvironment, getRuntimeVersion } from '../../../config/runtime-version';

// Handle CORS preflight requests
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Client-Version',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: Request) {
  try {
    const runtimeVersion = getRuntimeVersion();
    const runtimeEnvironment = getRuntimeEnvironment();

    // Get client version from query params or headers (if frontend sends it)
    const url = new URL(request.url);
    const clientVersion = url.searchParams.get('clientVersion') || 
                         request.headers.get('X-Client-Version') || 
                         null;
    
    // Read versions.json from config directory
    // Try multiple paths to ensure we always get the latest version
    const possiblePaths = [
      join(process.cwd(), 'config', 'versions.json'),
      join(process.cwd(), 'dist', 'client', 'config', 'versions.json'),
      join(process.cwd(), 'dist', 'config', 'versions.json'),
    ];
    
    let versionsData = null;
    let versionsPath = null;
    
    for (const path of possiblePaths) {
      try {
        versionsData = readFileSync(path, 'utf-8');
        versionsPath = path;
        break;
      } catch {
        // Try next path
        continue;
      }
    }
    
    if (!versionsData) {
      throw new Error('versions.json not found in any expected location');
    }
    
    const versions = JSON.parse(versionsData);
    const backendVersion = runtimeVersion;
    versions.currentVersion = backendVersion;
    versions.environment = runtimeEnvironment;
    
    // Log for debugging (include client version if provided)
    console.log(`[API] Serving versions.json from: ${versionsPath}`);
    console.log(`[API] Backend version: ${backendVersion}`);
    if (clientVersion) {
      console.log(`[API] Client version: ${clientVersion}`);
      if (clientVersion !== backendVersion) {
        console.log(`[API] ⚠️ Version mismatch detected (Client: ${clientVersion}, Backend: ${backendVersion})`);
        // This is OK - we handle it gracefully without errors
      }
    }

    // Always return success - version mismatches are handled gracefully
    // Frontend can be newer or backend can be newer, both are acceptable
    return new Response(JSON.stringify({
      ...versions,
      // Include version comparison info for client-side handling
      versionInfo: {
        backendVersion,
        clientVersion: clientVersion || null,
        isMatch: clientVersion ? clientVersion === backendVersion : null,
        // Only suggest update if backend is newer (not if frontend is newer)
        needsUpdate: clientVersion ? compareAppVersions(clientVersion, backendVersion) < 0 : null,
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Version-Source': versionsPath || 'unknown',
        'X-Current-Version': backendVersion,
        'X-Timestamp': Date.now().toString(),
        // Ensure CORS headers for cross-origin requests (if needed)
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Client-Version',
      },
    });
  } catch (error: any) {
    console.error('[API] Error reading versions.json:', error);
    // Use the runtime branch-aware version as the fallback source of truth.
    try {
      const runtimeVersion = getRuntimeVersion();
      const runtimeEnvironment = getRuntimeEnvironment();
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const fallbackVersion = runtimeVersion || packageJson.version || '1.6.22';
      
      console.log(`[API] Using fallback runtime version: ${fallbackVersion}`);
      
      // Get client version from request
      const url = new URL(request.url);
      const clientVersion = url.searchParams.get('clientVersion') || 
                           request.headers.get('X-Client-Version') || 
                           null;
      
      return new Response(
        JSON.stringify({
          currentVersion: fallbackVersion,
          versions: [],
          environment: runtimeEnvironment,
          versionInfo: {
            backendVersion: fallbackVersion,
            clientVersion: clientVersion || null,
            isMatch: clientVersion ? clientVersion === fallbackVersion : null,
            needsUpdate: clientVersion ? compareAppVersions(clientVersion, fallbackVersion) < 0 : null,
          },
        }),
          {
          status: 200, // Always return 200 - don't fail on version mismatches
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Version-Source': 'runtime-version-fallback',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Client-Version',
          },
        }
      );
    } catch {
      // Last resort: return hardcoded version (still return 200, never fail)
      console.error('[API] Fallback also failed, using hardcoded version');
      const runtimeVersion = getRuntimeVersion();
      const runtimeEnvironment = getRuntimeEnvironment();
      return new Response(
        JSON.stringify({
          currentVersion: runtimeVersion || '1.6.22',
          versions: [],
          environment: runtimeEnvironment,
          versionInfo: {
            backendVersion: runtimeVersion || '1.6.22',
            clientVersion: null,
            isMatch: null,
            needsUpdate: null,
          },
        }),
        {
          status: 200, // Always return 200 - version mismatches are not errors
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Version-Source': 'hardcoded-fallback',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Client-Version',
          },
        }
      );
    }
  }
}
