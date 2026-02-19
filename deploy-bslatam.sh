#!/usr/bin/env bash
set -euo pipefail

echo "Building web..."
npm run build:web

echo "Applying Supabase migrations..."

MIGRATIONS_DIR="supabase/migrations"

apply_with_psql() {
  echo "Applying migrations using psql..."
  for f in $(ls -1 ${MIGRATIONS_DIR}/*.sql | sort); do
    echo " - Applying $f"
    PGPASSWORD="${SUPABASE_DB_PASSWORD:-}" psql "${EXPO_PUBLIC_SUPABASE_URL}" -v ON_ERROR_STOP=1 -f "$f"
  done
}

apply_with_supabase_cli() {
  echo "Applying migrations using Supabase CLI..."
  # Requires: SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN
  # If already linked, db push will use the linked project; otherwise, try link non-interactively
  if supabase status >/dev/null 2>&1; then
    echo " - Supabase project is linked."
  else
    if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
      echo " - Linking project ${SUPABASE_PROJECT_REF}"
      # Best-effort link (may already be linked); suppress prompt
      supabase link --project-ref "${SUPABASE_PROJECT_REF}" || true
    fi
  fi
  supabase db push || {
    echo "Supabase CLI push failed. Ensure SUPABASE_ACCESS_TOKEN and project link are configured." 1>&2
    exit 1
  }
}

if [[ -n "${SUPABASE_DB_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  apply_with_psql
elif command -v supabase >/dev/null 2>&1; then
  apply_with_supabase_cli
else
  echo "No migration method available. Set SUPABASE_DB_URL and install psql, or install Supabase CLI and set SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF." 1>&2
  exit 1
fi

echo "Seeding speakers..."
node ./scripts/seed-bslatam.mjs ./speakers.json || true

# Function to install Amplify CLI
install_amplify_cli() {
  echo "Amplify CLI not found. Attempting to install..."
  
  # Check if npm is available
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install Amplify CLI but not found. Please install Node.js and npm first." 1>&2
    return 1
  fi
  
  # Install Amplify CLI globally
  echo "Installing Amplify CLI globally..."
  if npm install -g @aws-amplify/cli; then
    echo "Amplify CLI installed successfully."
    return 0
  else
    echo "Failed to install Amplify CLI. Please install manually with: npm install -g @aws-amplify/cli" 1>&2
    return 1
  fi
}

# Check for Amplify CLI and install if needed
if ! command -v amplify >/dev/null 2>&1; then
  if install_amplify_cli; then
    echo "Amplify CLI installed successfully. Proceeding with deployment..."
  else
    echo "Amplify CLI installation failed. Please install manually and run 'amplify publish'." 1>&2
    exit 1
  fi
fi

echo "Deploying to Amplify hosting..."

# Check if we have an Amplify app configured
# Note: Folder renamed from amplify/ to amplify-backend-config/ to prevent auto-init
if [ -f "amplify-backend-config/.config/project-config.json" ] && [ -f "amplify-backend-config/team-provider-info.json" ]; then
  echo "Amplify project configuration found. Initializing environment if needed..."
  
  # Check if environment is initialized
  if [ ! -d "amplify-backend-config/backend" ] || [ ! -f "amplify-backend-config/backend/amplify-meta.json" ]; then
    echo "Initializing Amplify environment..."
    amplify init --yes || {
      echo "Failed to initialize Amplify environment. Please run 'amplify init' manually." 1>&2
      exit 1
    }
  fi
  
  # Check if hosting is configured
  echo "Checking if hosting is configured..."
  if ! amplify hosting status >/dev/null 2>&1; then
    echo "⚠️  Hosting is not configured for this project." 1>&2
    echo "" 1>&2
    echo "To fix this, you need to add hosting manually:" 1>&2
    echo "1. Run: amplify hosting add" 1>&2
    echo "2. Select the default options when prompted" 1>&2
    echo "3. Then run this script again" 1>&2
    echo "" 1>&2
    echo "Alternatively, you can deploy manually using:" 1>&2
    echo "- AWS Console: https://console.aws.amazon.com/amplify/" 1>&2
    echo "- Connect your GitHub repository to Amplify" 1>&2
    echo "- Set build command: npm run build:web" 1>&2
    echo "- Set output directory: dist/client" 1>&2
    exit 1
  fi
  
  # Deploy to Amplify hosting
  echo "Publishing to Amplify hosting..."
  amplify publish --yes || {
    echo "Amplify publish failed. This might be due to:" 1>&2
    echo "1. AWS credentials not configured" 1>&2
    echo "2. Insufficient permissions" 1>&2
    echo "3. Network connectivity issues" 1>&2
    echo "" 1>&2
    echo "Please check your AWS credentials and try again." 1>&2
    exit 1
  }
else
  echo "Amplify project configuration not found. Please ensure:" 1>&2
  echo "1. amplify-backend-config/.config/project-config.json exists" 1>&2
  echo "2. amplify-backend-config/team-provider-info.json exists" 1>&2
  echo "3. Run 'amplify init' to initialize the project" 1>&2
  exit 1
fi

echo "Done."


