#!/usr/bin/env node
/**
 * Execute the function migration using Supabase REST API
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

async function runFunctionMigration() {
  console.log('🔄 Running function migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250131000041_update_tier_system_percentage_based.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Extract just the function definition (before the DO block)
    const functionSQL = migrationSQL.split('-- Update all existing passes')[0].trim();
    
    console.log('📄 Function SQL prepared\n');
    console.log('Executing via Supabase REST API...\n');
    
    // Use Supabase REST API to execute SQL via exec_sql RPC
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql_query: functionSQL }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Function updated successfully!\n');
      console.log('📊 Migration complete:');
      console.log('   - get_pass_type_limits function now calculates limits dynamically');
      console.log('   - General: 25% of total speakers');
      console.log('   - Business: 63% of total speakers');
      console.log('   - VIP: 101% of total speakers\n');
      return;
    }

    // If exec_sql doesn't exist, try alternative approach
    const errorText = await response.text();
    console.log('⚠️  exec_sql RPC not available, trying alternative...\n');
    
    // Alternative: Use the Management API
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (projectRef) {
      console.log('📝 Please execute the SQL manually:\n');
      console.log('Option 1 - Supabase Dashboard (Recommended):');
      console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql');
      console.log('   2. Copy and paste the following SQL:\n');
      console.log(functionSQL);
      console.log('\nOption 2 - Supabase CLI:');
      console.log('   supabase db push\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Please execute the migration manually using Supabase Dashboard SQL Editor\n');
    process.exit(1);
  }
}

runFunctionMigration();


