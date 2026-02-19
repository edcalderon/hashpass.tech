#!/usr/bin/env node
/**
 * Execute the function migration SQL directly using Supabase client
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

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeFunctionMigration() {
  console.log('🔄 Executing function migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250131000041_update_tier_system_percentage_based.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Extract just the function definition (before the DO block that updates passes)
    // We'll skip the pass update since we already did that
    const functionSQL = migrationSQL.split('-- Update all existing passes')[0].trim();
    
    console.log('📄 Executing function update SQL...\n');
    
    // Execute SQL using rpc - but we need to use the REST API directly
    // Supabase JS client doesn't support raw SQL execution
    // So we'll use fetch to call the REST API
    
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('Could not extract project ref from Supabase URL');
    }

    // Use the PostgREST endpoint to execute SQL via a function
    // Actually, we need to use the Supabase Management API or create a helper function
    
    // Alternative: Create a temporary RPC function that executes our SQL
    // But the simplest is to use the REST API with proper auth
    
    const restUrl = `${supabaseUrl}/rest/v1/rpc/exec_sql`;
    
    // Try using a direct POST to the database
    // Actually, let's use the Supabase client's postgrest client directly
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: functionSQL 
    }).catch(async () => {
      // If exec_sql doesn't exist, try using fetch with the REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ sql: functionSQL }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to execute SQL: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      return { data: await response.json(), error: null };
    });

    if (error) {
      throw error;
    }

    console.log('✅ Function updated successfully!\n');
    console.log('📊 Migration complete:');
    console.log('   - get_pass_type_limits function now calculates limits dynamically');
    console.log('   - General: 25% of total speakers');
    console.log('   - Business: 63% of total speakers');
    console.log('   - VIP: 101% of total speakers\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Provide manual instructions
    console.log('\n📝 Manual execution required:');
    console.log('The function SQL needs to be executed directly in the database.\n');
    console.log('Option 1 - Supabase Dashboard:');
    console.log('   1. Go to your Supabase project dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the function SQL from:');
    console.log(`      ${path.join(__dirname, '../supabase/migrations/20250131000041_update_tier_system_percentage_based.sql')}`);
    console.log('   4. Execute the SQL\n');
    console.log('Option 2 - Supabase CLI:');
    console.log('   supabase db push\n');
    
    process.exit(1);
  }
}

executeFunctionMigration();


