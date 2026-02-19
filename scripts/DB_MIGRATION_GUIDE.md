# Database Migration Guide

This guide explains how to migrate the database schema from the development Supabase instance to the production instance.

## Overview

The migration process copies the complete database structure (schema only, no data) from:
- **Source (Dev)**: `https://tgbdilebadmzqwubsijr.supabase.co`
- **Production**: `https://fxgftanraszjjyeidvia.supabase.co`

### What Gets Migrated

✅ **Included:**
- Tables and columns
- Indexes
- Foreign key constraints
- Custom types/enums
- Functions (RPC functions)
- Triggers
- Row Level Security (RLS) policies
- Sequences

❌ **Excluded:**
- Data (rows in tables)
- Users and authentication data
- Storage buckets

## Prerequisites

1. **PostgreSQL Client Tools** installed:
   - `pg_dump` - for extracting schema
   - `psql` - for applying schema

   **Installation:**
   ```bash
   # macOS
   brew install postgresql
   
   # Ubuntu/Debian
   sudo apt-get install postgresql-client
   
   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Database Connection Strings** from Supabase Dashboard:
   - Go to Supabase Dashboard > Settings > Database
   - Find "Connection string" section
   - Select "URI" format
   - Copy the connection string (it looks like):
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
     ```

## Migration Steps

### Step 1: Get Database Connection Strings

1. **Source Database (Dev)**:
   - Go to: https://supabase.com/dashboard/project/tgbdilebadmzqwubsijr/settings/database
   - Copy the "URI" connection string
   - Replace `[YOUR-PASSWORD]` with your database password

2. **Production Database**:
   - Go to: https://supabase.com/dashboard/project/fxgftanraszjjyeidvia/settings/database
   - Copy the "URI" connection string
   - Replace `[YOUR-PASSWORD]` with your database password

### Step 2: Set Environment Variables

```bash
export SOURCE_DB_URL="postgresql://postgres:[DEV-PASSWORD]@db.tgbdilebadmzqwubsijr.supabase.co:5432/postgres"
export PROD_DB_URL="postgresql://postgres:[PROD-PASSWORD]@db.fxgftanraszjjyeidvia.supabase.co:5432/postgres"
```

**⚠️ Security Note:** These connection strings contain passwords. Don't commit them to version control.

### Step 3: Run Migration Script

**Option A: Using Bash Script (Recommended)**
```bash
./scripts/migrate-db-to-prod.sh
```

**Option B: Using Node.js Script**
```bash
node scripts/migrate-db-schema-supabase.mjs
```

**Option C: Manual Migration**
```bash
# Extract schema from source
pg_dump "$SOURCE_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-tablespaces \
  --clean \
  --if-exists \
  -f schema-dump.sql

# Apply schema to production
psql "$PROD_DB_URL" -f schema-dump.sql

# Clean up
rm schema-dump.sql
```

## What the Script Does

1. **Extracts Schema**: Uses `pg_dump` with `--schema-only` flag to extract:
   - Table definitions
   - Functions
   - Triggers
   - RLS policies
   - Enums and custom types
   - Indexes and constraints

2. **Applies Schema**: Uses `psql` to execute the extracted SQL on the production database

3. **Flags Used**:
   - `--schema-only`: Only extract schema, not data
   - `--no-owner`: Don't set ownership (Supabase manages this)
   - `--no-privileges`: Don't set privileges (RLS handles security)
   - `--no-tablespaces`: Don't set tablespaces
   - `--clean`: Include DROP statements before CREATE
   - `--if-exists`: Use IF EXISTS when dropping objects

## Verification

After migration, verify the following in the production database:

1. **Tables**: Check that all tables exist
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
   ```

2. **Functions**: Check that all RPC functions exist
   ```sql
   SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
   ```

3. **Triggers**: Check that triggers are in place
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgisinternal = false;
   ```

4. **RLS Policies**: Verify RLS policies are enabled
   ```sql
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
   ```

## Troubleshooting

### Error: "pg_dump: command not found"
- Install PostgreSQL client tools (see Prerequisites)

### Error: "connection to server failed"
- Verify connection strings are correct
- Check that database password is correct
- Ensure network access is allowed

### Error: "relation already exists"
- This is normal if objects already exist
- The `--clean --if-exists` flags should handle this
- You can safely ignore warnings about objects that don't exist

### Error: "permission denied"
- Ensure you're using the correct database password
- Check that the connection string uses the right user (usually `postgres`)

### Error: "function does not exist"
- Some functions might have dependencies
- Check the order of function creation in the dump
- You may need to create helper functions first

## Important Notes

1. **Backup First**: Always backup your production database before migration
2. **Test in Staging**: If possible, test the migration on a staging environment first
3. **Data Migration**: This script only migrates schema. To migrate data, use a separate process
4. **Environment Variables**: Update your application's environment variables to point to production after migration
5. **RLS Policies**: Verify RLS policies work correctly in production
6. **Functions**: Test all RPC functions to ensure they work in production

## Rollback

If something goes wrong, you can:

1. **Restore from Backup**: Use Supabase dashboard to restore from a backup
2. **Manual Cleanup**: Drop objects manually if needed
3. **Re-run Migration**: Fix issues and re-run the migration script

## Support

If you encounter issues:
1. Check the error messages carefully
2. Verify connection strings and passwords
3. Check Supabase dashboard for database status
4. Review the migration logs for specific errors


