#!/usr/bin/env node
/**
 * Execute SQL directly using Supabase REST API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get from environment or use provided values
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgbdilebadmzqwubsijr.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('Please set SUPABASE_SERVICE_ROLE_KEY in your environment');
  process.exit(1);
}

async function executeSQL() {
  console.log('🔄 Executing SQL migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    console.log('⚠️  Supabase REST API cannot execute CREATE FUNCTION statements directly.');
    console.log('Please apply this SQL manually via Supabase Dashboard SQL Editor.\n');
    console.log('📋 SQL Content:\n');
    console.log('─'.repeat(80));
    console.log(migrationSQL);
    console.log('─'.repeat(80));
    console.log('\n📝 Steps to apply:');
    console.log('1. Go to: https://supabase.com/dashboard/project/tgbdilebadmzqwubsijr/sql');
    console.log('2. Click "New Query"');
    console.log('3. Paste the SQL above');
    console.log('4. Click "Run" to execute');
    console.log('5. Verify the function was created successfully\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

executeSQL();


