#!/usr/bin/env node
/**
 * Apply wallet authentication migration directly to Supabase
 * This script reads the migration file and applies it via the Supabase REST API
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Get environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease set these in your .env file or environment.');
  process.exit(1);
}

// Read the migration file
const migrationPath = join(projectRoot, 'supabase', 'migrations', '20250123000000_create_wallet_auth.sql');
let migrationSQL;

try {
  migrationSQL = readFileSync(migrationPath, 'utf-8');
  console.log('✅ Migration file loaded');
} catch (error) {
  console.error('❌ Failed to read migration file:', error.message);
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Split SQL into individual statements (simple approach - split by semicolon)
// Note: This is a simplified approach. For production, use a proper SQL parser
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`\n📝 Applying ${statements.length} SQL statements...\n`);

// Apply each statement
let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];
  
  // Skip empty statements and comments
  if (!statement || statement.length < 10) continue;
  
  try {
    // Use RPC to execute SQL (if available) or use direct query
    // Note: Supabase doesn't expose raw SQL execution via REST API
    // So we'll need to use psql or the dashboard
    
    console.log(`⚠️  Note: This script cannot execute SQL directly via REST API.`);
    console.log(`   Please apply the migration using one of these methods:\n`);
    console.log(`   1. Supabase Dashboard:`);
    console.log(`      - Go to: ${supabaseUrl.replace('/rest/v1', '')}/project/_/sql`);
    console.log(`      - Copy and paste the migration SQL`);
    console.log(`      - Click "Run"\n`);
    console.log(`   2. Using psql:`);
    console.log(`      psql "${supabaseUrl.replace('/rest/v1', '').replace('https://', 'postgresql://postgres:[PASSWORD]@').replace('http://', 'postgresql://postgres:[PASSWORD]@')}/postgres" -f ${migrationPath}\n`);
    console.log(`   3. Using Supabase CLI:`);
    console.log(`      supabase db push\n`);
    
    break;
  } catch (error) {
    console.error(`❌ Error in statement ${i + 1}:`, error.message);
    errorCount++;
  }
}

if (errorCount === 0 && successCount > 0) {
  console.log(`\n✅ Migration applied successfully!`);
} else {
  console.log(`\n⚠️  Please apply the migration manually using one of the methods above.`);
}

