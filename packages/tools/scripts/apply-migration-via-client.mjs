#!/usr/bin/env node
/**
 * Apply migration using Supabase client directly
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get from environment - try multiple ways
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgbdilebadmzqwubsijr.supabase.co';
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// If not in env, try to get from command line or use default
if (!serviceKey && process.argv[2]) {
  serviceKey = process.argv[2];
}

if (!serviceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('Usage: node scripts/apply-migration-via-client.mjs [SERVICE_KEY]');
  console.log('Or set SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🔄 Applying migration via Supabase client...\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    
    // Try to execute via RPC if exec_sql exists
    console.log('Attempting to execute via RPC exec_sql...\n');
    
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: migrationSQL 
    });

    if (!error) {
      console.log('✅ Migration applied successfully via RPC!\n');
      console.log('Response:', data);
      return;
    }

    // If exec_sql doesn't exist, try Management API
    console.log('⚠️  exec_sql RPC not available, trying Management API...\n');
    
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || 'tgbdilebadmzqwubsijr';
    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
    
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: migrationSQL,
      }),
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ Migration applied successfully via Management API!\n');
      console.log('Response:', responseText);
    } else {
      console.error('❌ Both methods failed');
      console.error('RPC error:', error?.message);
      console.error('Management API error:', response.status, responseText);
      console.log('\n📝 Please apply manually via Supabase Dashboard SQL Editor\n');
      console.log(`URL: https://supabase.com/dashboard/project/${projectRef}/sql\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Please apply the migration manually via Supabase Dashboard SQL Editor\n');
  }
}

applyMigration();


