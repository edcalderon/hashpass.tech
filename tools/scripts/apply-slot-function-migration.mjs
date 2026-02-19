#!/usr/bin/env node
/**
 * Apply the get_speaker_available_slots function migration
 * This adds requester conflict checking to the function
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
    console.log('Executing function update...\n');
    
    // Extract project ref from URL
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('Could not extract project ref from Supabase URL');
    }

    // Use Supabase Management API to execute SQL
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

    if (!response.ok) {
      const errorText = await response.text();
      
      // If Management API doesn't work, provide manual instructions
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        console.log('⚠️  Management API access failed. Please apply manually:\n');
        console.log('Option 1 - Supabase Dashboard (Recommended):');
        console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql');
        console.log('   2. Copy and paste the SQL from:');
        console.log(`      ${migrationPath}\n`);
        console.log('Option 2 - Supabase CLI:');
        console.log('   supabase db push\n');
        console.log('The SQL to execute:\n');
        console.log('─'.repeat(60));
        console.log(migrationSQL);
        console.log('─'.repeat(60));
        return;
      }
      
      throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Database error: ${result.error}`);
    }

    console.log('✅ Function updated successfully!\n');
    console.log('📊 Migration complete:');
    console.log('   - get_speaker_available_slots now supports p_requester_id parameter');
    console.log('   - Function checks for requester conflicts');
    console.log('   - Slots are filtered to exclude requester meetings and blocked slots\n');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    
    // Provide manual instructions
    console.log('\n📝 Manual execution required:\n');
    console.log('Option 1 - Supabase Dashboard (Recommended):');
    console.log('   1. Go to your Supabase project dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the SQL from:');
    console.log(`      ${path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql')}\n`);
    console.log('Option 2 - Supabase CLI:');
    console.log('   supabase db push\n');
    
    process.exit(1);
  }
}

applyMigration();


