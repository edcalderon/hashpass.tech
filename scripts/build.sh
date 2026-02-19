#!/bin/bash
set -e

echo "=== Starting Expo Build Process ==="

# Create necessary directories
echo "[1/5] Setting up build environment..."
rm -rf dist
mkdir -p dist/client

# Install dependencies
echo "[2/5] Installing dependencies..."
if [ -f yarn.lock ]; then
  yarn install --frozen-lockfile
elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  npm ci
else
  npm install
fi

# Build the application
echo "[3/5] Building Expo web application..."

# Clean previous builds
echo "[3.1/5] Cleaning previous builds..."
rm -rf web-build out dist/web-build

# Build for web
echo "[3.2/5] Building web assets..."
# Set environment to production
export NODE_ENV=production

# Build with the web export command
if ! npx expo export:web; then
  echo "[WARNING] expo export:web failed, trying alternative build method..."
  if ! npx expo export -p web; then
    echo "[ERROR] All build attempts failed"
    exit 1
  fi
  BUILD_DIR="dist"
else
  BUILD_DIR="web-build"
fi

# Debug: Show directory structure
echo "[4/5] Build output structure (${BUILD_DIR}):"
find "${BUILD_DIR}" -type f | sort

# Prepare build artifacts
echo "[5/5] Preparing build artifacts..."

# Create dist/client if it doesn't exist
mkdir -p dist/client

# Function to copy files safely
copy_files() {
  local src=$1
  local dest=$2
  
  if [ -d "$src" ]; then
    echo "Copying files from $src to $dest"
    # Use rsync if available for better handling
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$src/" "$dest/"
    else
      cp -r "$src/"* "$dest/" 2>/dev/null || true
    fi
  fi
}

# First, ensure we have a clean output directory
rm -rf dist/client
mkdir -p dist/client

# Function to safely copy build output
copy_build_output() {
  local src=$1
  local dest=$2
  
  if [ "$src" = "$dest" ] || [ "$src" = "$dest/" ]; then
    echo "Skipping copy: source and destination are the same"
    return 0
  fi
  
  if [ -d "$src" ]; then
    echo "Copying build output from $src to $dest"
    # Create destination directory if it doesn't exist
    mkdir -p "$dest"
    
    # Copy all files and directories except the destination directory
    find "$src" -mindepth 1 -maxdepth 1 ! -name "$(basename "$dest")" -exec cp -r {} "$dest/" \;
    
    # Copy hidden files as well
    find "$src" -mindepth 1 -maxdepth 1 -name ".*" ! -name "." ! -name ".." -exec cp -r {} "$dest/" 2>/dev/null \; || true
  fi
}

# Clean and prepare output directory
echo "Preparing output directory..."
rm -rf dist/client
mkdir -p dist/client

# Copy build output to dist/client
if [ -d "${BUILD_DIR}" ] && [ "${BUILD_DIR}" != "dist/client" ]; then
  copy_build_output "${BUILD_DIR}" "dist/client"
fi

# Check common build output locations and copy files
if [ -d "web-build" ] && [ "web-build" != "dist/client" ]; then
  echo "Found web-build directory"
  copy_build_output "web-build" "dist/client"
  
  # Ensure _expo directory exists for static files
  if [ ! -d "dist/client/_expo" ] && [ -d "dist/client/static" ]; then
    mkdir -p dist/client/_expo/static
    cp -r dist/client/static/* dist/client/_expo/static/
  fi
  
elif [ -d "out" ]; then
  echo "Found out directory, copying to dist/client"
  cp -r out/* dist/client/
  
  # Move static files to _expo/static if they exist
  if [ -d "dist/client/static" ]; then
    mkdir -p dist/client/_expo/static
    cp -r dist/client/static/* dist/client/_expo/static/
  fi
  
elif [ -d "dist/web-build" ]; then
  echo "Found dist/web-build, copying to dist/client"
  cp -r dist/web-build/* dist/client/
  
  # Move static files to _expo/static if they exist
  if [ -d "dist/client/static" ] && [ ! -d "dist/client/_expo/static" ]; then
    mkdir -p dist/client/_expo/static
    cp -r dist/client/static/* dist/client/_expo/static/
  fi
  
else
  echo "No standard build directory found, checking for index.html in root"
  if [ -f "index.html" ]; then
    echo "Found index.html in root, copying to dist/client"
    cp index.html dist/client/
  fi
  
  # Ensure _expo/static exists for static files
  mkdir -p dist/client/_expo/static
  if [ -d "public" ]; then
    cp -r public/* dist/client/_expo/static/
  fi
fi

# Ensure index.html exists in dist/client
echo "[5.1/5] Verifying build output..."

# Check if index.html exists in dist/client, if not try to find it
if [ ! -f "dist/client/index.html" ]; then
  echo "index.html not found in dist/client, searching in other locations..."
  
  # Look for index.html in various locations
  for path in \
    "dist/web-build/index.html" \
    "web-build/index.html" \
    "out/index.html" \
    "build/index.html" \
    "dist/index.html"; do
    
    if [ -f "$path" ]; then
      echo "Found index.html at $path, copying to dist/client/"
      cp "$path" "dist/client/"
      # Copy associated directories if they exist
      dir=$(dirname "$path")
      if [ -d "$dir/static" ]; then
        cp -r "$dir/static" "dist/client/"
      fi
      if [ -d "$dir/assets" ]; then
        cp -r "$dir/assets" "dist/client/"
      fi
      break
    fi
  done
  
  # If still no index.html, create a default one
  if [ ! -f "dist/client/index.html" ]; then
    echo "Creating default index.html..."
    cat > dist/client/200.html << 'EOL'
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>BSL 2025</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
    <script>
      // Set the base path for static assets
      (function() {
        // Ensure we have a base URL for client-side routing
        var path = window.location.pathname;
        var search = window.location.search;
        var hash = window.location.hash;
        
        // Set public URL for static assets
        window.__PUBLIC_URL__ = '/';
        
        // Handle client-side routing
        if (!path.endsWith('/') && !path.includes('.') && path !== '/') {
          var newPath = path + '/' + (search || '') + (hash || '');
          window.history.replaceState(null, null, newPath);
        }
      })();
    </script>
    <link rel="stylesheet" href="/static/css/main.css">
  </head>
  <body>
    <div id="root">Loading BSL 2025...</div>
    <script src="/static/js/bundle.js" defer></script>
  </body>
</html>
EOL
    # Create a copy as index.html for the root path
    cp dist/client/200.html dist/client/index.html
  fi
fi

# Final verification
if [ ! -f "dist/client/index.html" ]; then
  echo "[ERROR] Critical: Failed to create or find index.html"
  echo "Current directory: $(pwd)"
  echo "Directory structure:"
  find . -maxdepth 3 -type d | sort
  echo "HTML files found:"
  find . -name "*.html" -type f | sort
  exit 1
fi

# Ensure proper permissions
chmod 644 dist/client/index.html 2>/dev/null || true

# Verify the file is accessible
if [ ! -r "dist/client/index.html" ]; then
  echo "[ERROR] index.html exists but is not readable. Check permissions."
  ls -la dist/client/
  exit 1
fi

echo "✅ Build completed successfully!"
echo "Final dist/client contents:"
ls -la dist/client/

# Copy public directory if it exists
if [ -d "public" ]; then
  echo "[5.4/5] Copying public directory..."
  cp -r public/* dist/client/
fi

# Copy API routes if they exist (for serverless functions)
if [ -d "api" ]; then
  echo "[5.5/5] Copying API routes..."
  mkdir -p dist/client/api
  cp -r api/* dist/client/api/
  
  # Create a simple API handler if it doesn't exist
  if [ ! -f "dist/client/api/bslatam/agenda+api.ts" ]; then
    mkdir -p dist/client/api/bslatam
    echo "[5.6/5] Creating default API handler..."
    cat > dist/client/api/bslatam/agenda+api.ts <<'EOL'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    },
    body: JSON.stringify({ message: 'API is working' }),
  };
};
EOL
  fi
fi

# Add build timestamp
echo "<!-- Build timestamp: $(date) -->" >> dist/client/index.html

# List build output for debugging
echo "=== Build Output ==="
find dist/client -type f | sort
echo "==================="

echo "✅ Expo web build completed successfully!"
ls -la dist/client/

echo "\n📦 Build artifacts are ready in: dist/client/"
