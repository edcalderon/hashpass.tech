#!/usr/bin/env node
/**
 * Execute SQL migration directly using Supabase REST API
 */

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

async function executeMigration() {
  console.log('🔄 Executing get_speaker_available_slots function migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    
    // Try to execute via REST API using exec_sql RPC (if it exists)
    console.log('Attempting to execute via REST API...\n');
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql_query: migrationSQL }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Function updated successfully!\n');
      console.log('📊 Migration complete:');
      console.log('   - get_speaker_available_slots now supports p_requester_id parameter');
      console.log('   - Function checks for requester conflicts');
      console.log('   - Slots are filtered to exclude requester meetings and blocked slots\n');
      return;
    }

    // If exec_sql doesn't exist, provide manual instructions
    const errorText = await response.text();
    console.log('⚠️  Direct execution not available. Please apply manually:\n');
    console.log('📋 SQL to Execute:\n');
    console.log('─'.repeat(80));
    console.log(migrationSQL);
    console.log('─'.repeat(80));
    console.log('\n📝 Instructions:\n');
    console.log('Option 1 - Supabase Dashboard (Recommended):');
    console.log('   1. Go to your Supabase project dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the SQL above');
    console.log('   4. Click "Run" to execute\n');
    console.log('Option 2 - Supabase CLI:');
    console.log('   supabase db push\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please apply the migration manually via Supabase Dashboard SQL Editor\n');
  }
}

executeMigration();


