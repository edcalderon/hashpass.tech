#!/usr/bin/env node
/**
 * Apply the get_speaker_available_slots function migration directly
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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function applyMigration() {
  console.log('🔄 Applying get_speaker_available_slots function migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    console.log('⚠️  This migration needs to be applied directly to the database.');
    console.log('Supabase JS client cannot execute CREATE FUNCTION statements.\n');
    console.log('Please apply this migration using one of these methods:\n');
    console.log('Option 1 - Supabase Dashboard (Recommended):');
    console.log('   1. Go to your Supabase project dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the SQL from:');
    console.log(`      ${migrationPath}\n`);
    console.log('Option 2 - Supabase CLI:');
    console.log('   supabase db push\n');
    console.log('Option 3 - Direct psql connection:');
    console.log(`   psql <connection_string> -f ${migrationPath}\n`);
    
    // Try to execute via RPC if there's an exec_sql function
    console.log('Attempting to execute via RPC...\n');
    
    // Split SQL into statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));
    
    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
          if (error) {
            console.log(`⚠️  Could not execute via RPC: ${error.message}`);
            break;
          }
        } catch (e) {
          console.log('⚠️  RPC execution not available');
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyMigration();


