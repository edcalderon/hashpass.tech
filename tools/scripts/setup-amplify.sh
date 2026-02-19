#!/bin/bash

# Setup Amplify configuration based on current branch
# This script helps manage branch-specific amplify.yml configurations

set -e

BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

echo "🔍 Detected branch: $BRANCH_NAME"

case "$BRANCH_NAME" in
  "main")
    if [ -f "amplify-main.yml" ]; then
      cp amplify-main.yml amplify.yml
      echo "✅ Linked amplify-main.yml → amplify.yml"
      echo "📋 Configuration for main branch (hashpass.tech - all events)"
    else
      echo "❌ Error: amplify-main.yml not found"
      exit 1
    fi
    ;;
  "bsl2025")
    if [ -f "amplify-bsl2025.yml" ]; then
      cp amplify-bsl2025.yml amplify.yml
      echo "✅ Linked amplify-bsl2025.yml → amplify.yml"
      echo "📋 Configuration for bsl2025 branch (bsl2025.hashpass.tech - BSL2025 only)"
    else
      echo "❌ Error: amplify-bsl2025.yml not found"
      exit 1
    fi
    ;;
  *)
    echo "⚠️  Unknown branch: $BRANCH_NAME"
    echo "📋 Using default amplify.yml (if exists)"
    if [ ! -f "amplify.yml" ]; then
      echo "❌ Error: amplify.yml not found and no branch-specific config available"
      exit 1
    fi
    ;;
esac

echo ""
echo "🚀 Next steps:"
echo "   1. Review amplify.yml"
echo "   2. Commit if needed: git add amplify.yml"
echo "   3. Push to trigger Amplify build"
echo ""
echo "💡 Note: In Amplify Console, you can also set branch-specific"
echo "   build settings that override this file."

