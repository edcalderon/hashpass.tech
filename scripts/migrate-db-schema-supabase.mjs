#!/usr/bin/env node

/**
 * Database Schema Migration Script (Supabase Client)
 * 
 * Migrates database structure from source to production Supabase instance using Supabase client.
 * Includes: tables, functions, triggers, RLS policies, enums, relations, and indexes.
 * 
 * Usage:
 *   node scripts/migrate-db-schema-supabase.mjs
 * 
 * Environment Variables Required:
 *   SOURCE_SUPABASE_URL - Source Supabase project URL (https://xxx.supabase.co)
 *   SOURCE_SUPABASE_SERVICE_KEY - Source Supabase service role key
 *   PROD_SUPABASE_URL - Production Supabase project URL (https://xxx.supabase.co)
 *   PROD_SUPABASE_SERVICE_KEY - Production Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source database (dev)
const SOURCE_SUPABASE_URL = process.env.SOURCE_SUPABASE_URL || 'https://tgbdilebadmzqwubsijr.supabase.co';
const SOURCE_SUPABASE_SERVICE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;

// Production database
const PROD_SUPABASE_URL = process.env.PROD_SUPABASE_URL || 'https://fxgftanraszjjyeidvia.supabase.co';
const PROD_SUPABASE_SERVICE_KEY = process.env.PROD_SUPABASE_SERVICE_KEY;

/**
 * Extract schema SQL from source database
 */
async function extractSchemaSQL(sourceClient) {
  console.log('📦 Extracting schema from source database...');
  
  // Get all schema elements using PostgreSQL queries
  const queries = [
    // Get all custom types/enums
    `SELECT 
      n.nspname as schema_name,
      t.typname as type_name,
      string_agg(e.enumlabel, E'\\n' ORDER BY e.enumsortorder) as enum_values
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY n.nspname, t.typname;`,
    
    // Get all functions
    `SELECT 
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_functiondef(p.oid) as function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname;`,
    
    // Get all tables with their columns
    `SELECT 
      schemaname,
      tablename,
      'CREATE TABLE ' || schemaname || '.' || tablename || ' (' || 
      string_agg(
        column_name || ' ' || data_type || 
        CASE WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')' ELSE '' END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
        ', '
      ) || ');' as table_definition
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY schemaname, tablename
    ORDER BY tablename;`,
    
    // Get all triggers
    `SELECT 
      tgname as trigger_name,
      pg_get_triggerdef(oid) as trigger_definition
    FROM pg_trigger
    WHERE tgisinternal = false
    ORDER BY tgname;`,
    
    // Get all RLS policies
    `SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;`
  ];
  
  let schemaSQL = [];
  
  try {
    // Use rpc to execute raw SQL (if available) or use Supabase's direct SQL execution
    // Note: Supabase client doesn't directly support arbitrary SQL, so we'll use a different approach
    console.log('⚠️  Supabase JS client has limitations for schema extraction.');
    console.log('   Using pg_dump approach instead...');
    return null; // Signal to use pg_dump instead
  } catch (error) {
    console.error('Error extracting schema:', error.message);
    throw error;
  }
}

/**
 * Execute SQL on database using Supabase client
 */
async function executeSQL(client, sql, description) {
  console.log(`\n${description}...`);
  
  try {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        // Use Supabase's RPC or direct query
        // Note: Supabase client requires service role key for admin operations
        const { error } = await client.rpc('exec_sql', { sql_query: statement }).catch(() => {
          // If exec_sql doesn't exist, we need to use a different approach
          return { error: { message: 'exec_sql function not available' } };
        });
        
        if (error && !error.message.includes('exec_sql')) {
          console.warn(`⚠️  Warning executing statement: ${error.message}`);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Main migration function using pg_dump (recommended approach)
 */
async function migrateWithPgDump() {
  console.log('🔄 Starting database migration using pg_dump...\n');
  console.log(`Source: ${SOURCE_SUPABASE_URL}`);
  console.log(`Production: ${PROD_SUPABASE_URL}\n`);
  
  // Check if pg_dump is available
  try {
    execSync('which pg_dump', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ pg_dump is not installed or not in PATH');
    console.error('\nPlease install PostgreSQL client tools:');
    console.error('  macOS: brew install postgresql');
    console.error('  Ubuntu/Debian: sudo apt-get install postgresql-client');
    console.error('  Windows: Download from https://www.postgresql.org/download/windows/');
    process.exit(1);
  }
  
  // Check if psql is available
  try {
    execSync('which psql', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ psql is not installed or not in PATH');
    process.exit(1);
  }
  
  console.log('📝 To get database connection strings:');
  console.log('   1. Go to Supabase Dashboard > Settings > Database');
  console.log('   2. Find "Connection string" section');
  console.log('   3. Select "URI" and copy the connection string');
  console.log('   4. Replace [YOUR-PASSWORD] with your database password\n');
  
  if (!process.env.SOURCE_DB_URL || !process.env.PROD_DB_URL) {
    console.error('❌ Database connection strings required:');
    console.error('\nPlease set environment variables:');
    console.error('  export SOURCE_DB_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"');
    console.error('  export PROD_DB_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"');
    console.error('\nOr run:');
    console.error('  SOURCE_DB_URL="..." PROD_DB_URL="..." node scripts/migrate-db-schema-supabase.mjs\n');
    process.exit(1);
  }
  
  const schemaFile = join(__dirname, '../.temp-schema-dump.sql');
  
  try {
    // Extract schema
    console.log('📦 Extracting schema from source database...');
    const dumpCommand = `pg_dump "${process.env.SOURCE_DB_URL}" --schema-only --no-owner --no-privileges --no-tablespaces --clean --if-exists -f "${schemaFile}"`;
    execSync(dumpCommand, { stdio: 'inherit' });
    
    // Apply schema
    console.log('\n🚀 Applying schema to production database...');
    const applyCommand = `psql "${process.env.PROD_DB_URL}" -f "${schemaFile}"`;
    execSync(applyCommand, { stdio: 'inherit' });
    
    console.log('\n✅ Migration completed successfully!');
    
    // Cleanup
    try {
      const fs = await import('fs/promises');
      await fs.unlink(schemaFile);
      console.log('🧹 Cleaned up temporary files');
    } catch (error) {
      console.warn('⚠️  Could not clean up temporary file');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
migrateWithPgDump().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


