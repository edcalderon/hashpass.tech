#!/bin/bash

# Script to remove unused SQL files
# These files appear to be development/debugging scripts that are no longer needed

cd "$(dirname "$0")/../scripts/sql" || exit 1

# List of files to remove
FILES_TO_REMOVE=(
  "clean-function-fix.sql"
  "complete-fix-all-issues.sql"
  "comprehensive-uuid-standardization.sql"
  "debug-request-issues.sql"
  "diagnose-database-schema.sql"
  "diagnose-database-types.sql"
  "emergency-fix-404.sql"
  "emergency-fix-final.sql"
  "final-comprehensive-fix.sql"
  "final-fix-404.sql"
  "fix-404-errors.sql"
  "fix-all-type-casting.sql"
  "fix-all-type-issues-comprehensive.sql"
  "fix-all-uuid-standardization.sql"
  "fix-cancel-function-final.sql"
  "fix-cancel-meeting-request.sql"
  "fix-column-names.sql"
  "fix-function-overloading.sql"
  "fix-functions.sql"
  "fix-get-meeting-requests-function.sql"
  "fix-get-user-pass-info.sql"
  "fix-insert-function-conflict.sql"
  "fix-insert-meeting-request-final.sql"
  "fix-insert-meeting-request-robust.sql"
  "fix-meeting-request-functions-robust.sql"
  "fix-meeting-request-functions.sql"
  "fix-meeting-request-submission.sql"
  "fix-meeting-requests-types.sql"
  "fix-request-counting.sql"
  "fix-request-detection-and-cancel.sql"
  "fix-speaker-id-mismatch.sql"
  "fix-speaker-meeting-requests-function.sql"
  "fix-trigger-function.sql"
  "quick-fix-insert-function.sql"
  "ultimate-complete-fix.sql"
)

# Create a backup directory
BACKUP_DIR="../../backup/sql/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Move files to backup instead of deleting them
for file in "${FILES_TO_REMOVE[@]}"; do
  if [ -f "$file" ]; then
    echo "Moving $file to $BACKUP_DIR/"
    mv "$file" "$BACKUP_DIR/"
  fi
done

echo "Cleanup complete. Files have been moved to $BACKUP_DIR"
