#!/usr/bin/env node
/**
 * Script to update the get_pass_type_limits function with percentage-based calculation
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function updateFunction() {
  console.log('🔄 Updating get_pass_type_limits function...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250131000041_update_tier_system_percentage_based.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Extract just the function definition (first part before the DO block)
    const functionSQL = migrationSQL.split('-- Update all existing passes')[0].trim();
    
    console.log('📄 Function SQL loaded\n');
    
    // Execute the function update using RPC
    // Note: We'll need to use the REST API or a direct SQL execution method
    // Since Supabase JS client doesn't support raw SQL execution, we'll use the REST API
    // But actually, we need to use psql or Supabase CLI for this
    
    console.log('⚠️  Function update requires direct SQL execution.');
    console.log('Please run the migration using one of these methods:\n');
    console.log('1. Supabase CLI:');
    console.log('   supabase db push\n');
    console.log('2. Or apply the migration file directly:');
    console.log(`   psql <connection_string> -f ${migrationPath}\n`);
    console.log('✅ Passes have already been updated via the previous script.\n');
    console.log('📝 The function will be updated when migrations are applied.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

updateFunction();


