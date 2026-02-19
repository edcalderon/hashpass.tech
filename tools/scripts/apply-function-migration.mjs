#!/usr/bin/env node
/**
 * Script to apply the function migration using Supabase REST API
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

async function applyFunctionMigration() {
  console.log('🔄 Applying function migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250131000041_update_tier_system_percentage_based.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Extract just the function definition (before the DO block that updates passes)
    const functionSQL = migrationSQL.split('-- Update all existing passes')[0].trim();
    
    console.log('📄 Function SQL extracted\n');
    console.log('Executing function update...\n');
    
    // Use Supabase REST API to execute SQL
    // Extract project ref from URL
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('Could not extract project ref from Supabase URL');
    }

    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
    
    // Execute the SQL using Supabase Management API
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: functionSQL,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Database error: ${result.error}`);
    }

    console.log('✅ Function updated successfully!\n');
    console.log('📊 Summary:');
    console.log('   - get_pass_type_limits function now calculates limits dynamically');
    console.log('   - General: 25% of total speakers');
    console.log('   - Business: 63% of total speakers');
    console.log('   - VIP: 101% of total speakers\n');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    
    // If Management API doesn't work, provide alternative instructions
    if (error.message.includes('API request failed') || error.message.includes('401') || error.message.includes('403')) {
      console.log('\n⚠️  Management API access failed. Please use one of these alternatives:\n');
      console.log('1. Supabase CLI (recommended):');
      console.log('   supabase db push\n');
      console.log('2. Supabase Dashboard:');
      console.log('   - Go to SQL Editor');
      console.log('   - Paste the function SQL from the migration file');
      console.log('   - Execute\n');
      console.log('3. Direct psql connection:\n');
      console.log('   psql <connection_string> -f supabase/migrations/20250131000041_update_tier_system_percentage_based.sql\n');
    }
    
    process.exit(1);
  }
}

applyFunctionMigration();


